import { EventBus } from './event-bus.js';
import { StateManager } from './state-manager.js';
import { AgentDispatcher } from './agent-dispatcher.js';
import { OrchestratorRunner } from '../agents/orchestrator.js';
import { DeveloperRunner } from '../agents/developer.js';
import { ReviewerRunner } from '../agents/reviewer.js';
import { ClaudeRunner } from './claude-runner.js';
import { Logger } from '../utils/logger.js';
import {
  getMilestoneIds,
  getTasksByAssignee,
} from '../parsers/task-parser.js';
import { getUnresolvedFindings } from '../parsers/review-parser.js';
import type { ClorcConfig } from '../types/index.js';

export class LoopController {
  private config: ClorcConfig;
  private cwd: string;
  private state: StateManager;
  private runner: ClaudeRunner;
  private orchestrator: OrchestratorRunner;
  private dispatcher: AgentDispatcher;
  private reviewer: ReviewerRunner;
  private logger: Logger;
  private aborted = false;

  constructor(config: ClorcConfig, cwd: string) {
    this.config = config;
    this.cwd = cwd;
    this.state = new StateManager(config.agentDir);
    this.runner = new ClaudeRunner();
    this.logger = new Logger(config.agentDir);

    this.orchestrator = new OrchestratorRunner(this.runner, this.state, config, cwd);
    const developer = new DeveloperRunner(this.runner, config, cwd);
    this.dispatcher = new AgentDispatcher(developer, config);
    this.reviewer = new ReviewerRunner(this.runner, this.state, config, cwd);
  }

  abort(): void {
    this.aborted = true;
    this.runner.kill();
  }

  getLogger(): Logger {
    return this.logger;
  }

  async run(mission: string): Promise<void> {
    const bus = EventBus.getInstance();
    const startTime = Date.now();

    bus.emitEvent('mission:start', {
      mission,
      timestamp: new Date().toISOString(),
    });

    // Phase 1: Planning
    const planSuccess = await this.orchestrator.run(mission);
    if (!planSuccess) {
      this.logger.info('Orchestrator failed, retrying...');
      const retrySuccess = await this.orchestrator.run(mission);
      if (!retrySuccess) {
        bus.emitEvent('error', {
          message: 'Orchestrator failed after retry',
          phase: 'planning',
          recoverable: false,
        });
        return;
      }
    }

    // Phase 2: Iterate milestones
    const queue = this.state.readTaskQueue();
    if (!queue) {
      bus.emitEvent('error', {
        message: 'No task queue found after planning',
        phase: 'execution',
        recoverable: false,
      });
      return;
    }

    const milestoneIds = getMilestoneIds(queue);
    let milestonesCompleted = 0;

    for (let i = 0; i < milestoneIds.length; i++) {
      if (this.aborted) break;

      const msId = milestoneIds[i];
      const msData = queue.milestones[msId];

      bus.emitEvent('milestone:start', {
        id: msId,
        title: msData?.name || msId,
        index: i + 1,
        total: milestoneIds.length,
      });

      // Get tasks for this milestone
      const currentQueue = this.state.readTaskQueue() || queue;
      const backendTasks = getTasksByAssignee(currentQueue, msId, 'backend');
      const frontendTasks = getTasksByAssignee(currentQueue, msId, 'frontend');

      // Phase 2a: Build context and execute tasks
      if (backendTasks.length > 0 || frontendTasks.length > 0) {
        const backendContext = this.state.buildTaskContext(msId, 'backend');
        const frontendContext = this.state.buildTaskContext(msId, 'frontend');

        await this.dispatcher.dispatchMilestoneTasks(
          msId,
          backendTasks,
          frontendTasks,
          backendContext,
          frontendContext,
        );
      }

      if (this.aborted) break;

      // Phase 2b: Review (lightweight for small milestones)
      const totalTasks = backendTasks.length + frontendTasks.length;
      const reviewMaxTurns = totalTasks <= 2
        ? Math.min(this.config.maxTurns, 30)
        : this.config.maxTurns;

      const reviewResult = await this.reviewer.review(
        msId,
        backendTasks,
        frontendTasks,
        reviewMaxTurns,
      );

      if (reviewResult.verdict === 'PASS') {
        milestonesCompleted++;
        bus.emitEvent('milestone:done', { id: msId, status: 'done' });
        this.logger.info(`Milestone ${msId} completed — PASS`);
        continue;
      }

      // Phase 2c: Fix cycle
      let fixCycle = 0;
      let resolved = false;
      let currentReview = reviewResult;

      while (fixCycle < this.config.maxFixCycles && !resolved && !this.aborted) {
        fixCycle++;
        const unresolvedFindings = getUnresolvedFindings(currentReview);

        if (unresolvedFindings.length === 0) {
          resolved = true;
          break;
        }

        bus.emitEvent('fix:start', {
          milestone: msId,
          cycle: fixCycle,
          findings: unresolvedFindings,
        });

        await this.dispatcher.dispatchFixes(msId, unresolvedFindings);

        bus.emitEvent('fix:done', { milestone: msId, cycle: fixCycle });

        if (this.aborted) break;

        const findingIds = unresolvedFindings.map(f => f.id);
        const verifyResult = await this.reviewer.verify(msId, findingIds, fixCycle);

        if (verifyResult.verdict === 'PASS') {
          resolved = true;
        } else {
          currentReview = verifyResult;
        }
      }

      if (resolved) {
        milestonesCompleted++;
        bus.emitEvent('milestone:done', { id: msId, status: 'done' });
        this.logger.info(`Milestone ${msId} completed after ${fixCycle} fix cycle(s)`);
      } else {
        bus.emitEvent('milestone:done', { id: msId, status: 'needs_manual_review' });
        this.logger.info(`Milestone ${msId} marked as needs_manual_review after ${fixCycle} fix cycles`);
      }
    }

    const totalDuration = Date.now() - startTime;
    bus.emitEvent('mission:done', {
      duration: totalDuration,
      milestonesCompleted,
      total: milestoneIds.length,
    });
  }
}
