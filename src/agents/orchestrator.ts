import { ClaudeRunner } from '../core/claude-runner.js';
import { PromptBuilder } from '../core/prompt-builder.js';
import { EventBus } from '../core/event-bus.js';
import { StateManager } from '../core/state-manager.js';
import { getMilestoneIds } from '../parsers/task-parser.js';
import { resolveSkillFile } from '../utils/resolve-skill.js';
import type { ClorcConfig } from '../types/index.js';

export class OrchestratorRunner {
  private runner: ClaudeRunner;
  private promptBuilder: PromptBuilder;
  private state: StateManager;
  private config: ClorcConfig;
  private cwd: string;

  constructor(runner: ClaudeRunner, state: StateManager, config: ClorcConfig, cwd: string) {
    this.runner = runner;
    this.promptBuilder = new PromptBuilder();
    this.state = state;
    this.config = config;
    this.cwd = cwd;
  }

  async run(mission: string): Promise<boolean> {
    const bus = EventBus.getInstance();
    const prompt = this.promptBuilder.buildOrchestratorPrompt(mission);
    const skillFile = resolveSkillFile(this.cwd, this.config.skillsDir, 'orchestrator', 'skill.md');

    bus.emitEvent('agent:start', {
      agent: 'orchestrator',
      milestone: 'planning',
      tasks: [],
      prompt,
    });

    const result = await this.runner.runWithRetry(
      {
        prompt,
        systemPromptFile: skillFile ?? undefined,
        maxTurns: this.config.maxTurns,
        model: this.config.model,
        workingDirectory: this.cwd,
        timeout: this.config.timeout,
        outputFormat: 'text',
      },
      'orchestrator',
      'planning',
    );

    bus.emitEvent('agent:done', {
      agent: 'orchestrator',
      milestone: 'planning',
      duration: result.duration,
      success: result.success,
      output: result.output,
    });

    if (!result.success) {
      bus.emitEvent('error', {
        message: `Orchestrator failed: exit code ${result.exitCode}`,
        phase: 'planning',
        recoverable: true,
      });
      return false;
    }

    // Validate output files exist
    const queue = this.state.readTaskQueue();
    const plan = this.state.readPlan();

    if (!queue || !plan) {
      bus.emitEvent('error', {
        message: 'Orchestrator did not create required files (plan.md or task_queue.json)',
        phase: 'planning',
        recoverable: true,
      });
      return false;
    }

    const milestoneIds = getMilestoneIds(queue);
    bus.emitEvent('plan:created', {
      milestones: milestoneIds.map(id => ({
        id,
        name: queue.milestones[id]?.name || id,
      })),
      taskCount: queue.tasks.length,
    });

    return true;
  }

  getRunner(): ClaudeRunner {
    return this.runner;
  }
}
