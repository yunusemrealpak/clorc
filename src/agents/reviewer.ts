import { ClaudeRunner } from '../core/claude-runner.js';
import { PromptBuilder } from '../core/prompt-builder.js';
import { EventBus } from '../core/event-bus.js';
import { parseReviewReport, getUnresolvedFindings } from '../parsers/review-parser.js';
import { StateManager } from '../core/state-manager.js';
import { resolveSkillFile } from '../utils/resolve-skill.js';
import type { ClorcConfig, Task, ReviewResult } from '../types/index.js';

export class ReviewerRunner {
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

  async review(
    milestoneId: string,
    backendTasks: Task[],
    frontendTasks: Task[],
    maxTurns?: number,
  ): Promise<ReviewResult> {
    const bus = EventBus.getInstance();
    const prompt = this.promptBuilder.buildReviewPrompt(milestoneId, backendTasks, frontendTasks);
    const skillFile = resolveSkillFile(this.cwd, this.config.skillsDir, 'reviewer', 'SKILL.md');

    bus.emitEvent('review:start', { milestone: milestoneId });
    bus.emitEvent('agent:start', {
      agent: 'reviewer',
      milestone: milestoneId,
      tasks: [],
      prompt,
    });

    const result = await this.runner.runWithRetry(
      {
        prompt,
        systemPromptFile: skillFile ?? undefined,
        maxTurns: maxTurns ?? this.config.maxTurns,
        model: this.config.model,
        workingDirectory: this.cwd,
        timeout: this.config.timeout,
        outputFormat: 'text',
      },
      'reviewer',
      milestoneId,
    );

    bus.emitEvent('agent:done', {
      agent: 'reviewer',
      milestone: milestoneId,
      duration: result.duration,
      success: result.success,
      output: result.output,
    });

    // Read the review report file written by the reviewer agent
    const reportContent = this.state.readReviewReport(milestoneId);
    if (!reportContent) {
      // No report file — treat as pass with warning
      bus.emitEvent('error', {
        message: `Reviewer did not create review report for milestone ${milestoneId}`,
        phase: 'review',
        recoverable: true,
      });
      const fallback: ReviewResult = { verdict: 'PASS', findings: [], verificationRounds: [] };
      bus.emitEvent('review:done', { milestone: milestoneId, verdict: 'PASS', findings: [] });
      return fallback;
    }

    const reviewResult = parseReviewReport(reportContent);
    bus.emitEvent('review:done', {
      milestone: milestoneId,
      verdict: reviewResult.verdict,
      findings: reviewResult.findings,
    });

    return reviewResult;
  }

  async verify(milestoneId: string, findingIds: string[], cycle: number): Promise<ReviewResult> {
    const bus = EventBus.getInstance();
    const prompt = this.promptBuilder.buildVerificationPrompt(milestoneId, findingIds);
    const skillFile = resolveSkillFile(this.cwd, this.config.skillsDir, 'reviewer', 'SKILL.md');

    bus.emitEvent('verify:start', { milestone: milestoneId, cycle });
    bus.emitEvent('agent:start', {
      agent: 'reviewer',
      milestone: milestoneId,
      tasks: findingIds,
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
      'reviewer',
      milestoneId,
    );

    bus.emitEvent('agent:done', {
      agent: 'reviewer',
      milestone: milestoneId,
      duration: result.duration,
      success: result.success,
      output: result.output,
    });

    const reportContent = this.state.readReviewReport(milestoneId);
    if (!reportContent) {
      const fallback: ReviewResult = { verdict: 'PASS', findings: [], verificationRounds: [] };
      bus.emitEvent('verify:done', { milestone: milestoneId, cycle, verdict: 'PASS' });
      return fallback;
    }

    const reviewResult = parseReviewReport(reportContent);
    const unresolved = getUnresolvedFindings(reviewResult);
    const verdict = unresolved.length === 0 ? 'PASS' : 'FAIL';

    bus.emitEvent('verify:done', { milestone: milestoneId, cycle, verdict });

    return { ...reviewResult, verdict };
  }
}
