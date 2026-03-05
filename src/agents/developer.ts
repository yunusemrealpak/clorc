import { ClaudeRunner } from '../core/claude-runner.js';
import { PromptBuilder } from '../core/prompt-builder.js';
import { EventBus } from '../core/event-bus.js';
import { resolveSkillFile } from '../utils/resolve-skill.js';
import type { ClorcConfig, Task, TaskContext, Finding } from '../types/index.js';

export class DeveloperRunner {
  private runner: ClaudeRunner;
  private promptBuilder: PromptBuilder;
  private config: ClorcConfig;
  private cwd: string;

  constructor(runner: ClaudeRunner, config: ClorcConfig, cwd: string) {
    this.runner = runner;
    this.promptBuilder = new PromptBuilder();
    this.config = config;
    this.cwd = cwd;
  }

  /**
   * Runs tasks in smart groups with session resume between groups.
   * Group size is controlled by config.taskGroupSize (default 3).
   * First group uses JSON output to capture session ID.
   * Subsequent groups resume the same session for context preservation.
   */
  async runTasks(
    assignee: 'backend' | 'frontend',
    milestoneId: string,
    tasks: Task[],
    context: TaskContext,
  ): Promise<boolean> {
    const bus = EventBus.getInstance();
    const skillFile = resolveSkillFile(this.cwd, this.config.skillsDir, assignee, 'SKILL.md');
    const groups = this.groupTasks(tasks);
    let sessionId: string | undefined;
    let allSuccess = true;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const isResumed = !!sessionId;
      const taskIds = group.map(t => t.id);

      const prompt = this.promptBuilder.buildGroupTaskPrompt(
        assignee,
        milestoneId,
        group,
        context,
        isResumed,
      );

      bus.emitEvent('agent:start', {
        agent: assignee,
        milestone: milestoneId,
        tasks: taskIds,
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
          outputFormat: 'stream-json',
          resumeSessionId: sessionId,
        },
        assignee,
        milestoneId,
      );

      bus.emitEvent('agent:done', {
        agent: assignee,
        milestone: milestoneId,
        duration: result.duration,
        success: result.success,
        output: result.output,
      });

      // Capture session ID for resume in next group
      if (result.sessionId) {
        sessionId = result.sessionId;
      }

      if (!result.success) {
        allSuccess = false;
        // Reset session — don't resume a failed session
        sessionId = undefined;
      }
    }

    return allSuccess;
  }

  async runFix(
    assignee: 'backend' | 'frontend',
    milestoneId: string,
    findings: Finding[],
  ): Promise<boolean> {
    const bus = EventBus.getInstance();
    const prompt = this.promptBuilder.buildFixPrompt(assignee, findings);
    const skillFile = resolveSkillFile(this.cwd, this.config.skillsDir, assignee, 'SKILL.md');

    bus.emitEvent('agent:start', {
      agent: assignee,
      milestone: milestoneId,
      tasks: findings.map(f => f.id),
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
        outputFormat: 'stream-json',
      },
      assignee,
      milestoneId,
    );

    bus.emitEvent('agent:done', {
      agent: assignee,
      milestone: milestoneId,
      duration: result.duration,
      success: result.success,
      output: result.output,
    });

    return result.success;
  }

  private groupTasks(tasks: Task[]): Task[][] {
    const groupSize = this.config.taskGroupSize || 3;
    const groups: Task[][] = [];
    for (let i = 0; i < tasks.length; i += groupSize) {
      groups.push(tasks.slice(i, i + groupSize));
    }
    return groups;
  }

  getRunner(): ClaudeRunner {
    return this.runner;
  }
}
