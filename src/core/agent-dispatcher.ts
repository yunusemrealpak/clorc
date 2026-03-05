import { DeveloperRunner } from '../agents/developer.js';
import type { Task, TaskContext, Finding, ClorcConfig } from '../types/index.js';

export class AgentDispatcher {
  private developer: DeveloperRunner;
  private config: ClorcConfig;

  constructor(developer: DeveloperRunner, config: ClorcConfig) {
    this.developer = developer;
    this.config = config;
  }

  async dispatchMilestoneTasks(
    milestoneId: string,
    backendTasks: Task[],
    frontendTasks: Task[],
    backendContext: TaskContext,
    frontendContext: TaskContext,
  ): Promise<{ backendSuccess: boolean; frontendSuccess: boolean }> {
    let backendSuccess = true;
    let frontendSuccess = true;

    const hasBackend = backendTasks.length > 0;
    const hasFrontend = frontendTasks.length > 0;

    // Parallel execution when both assignees have tasks and config allows it
    if (this.config.parallelAgents && hasBackend && hasFrontend) {
      const [bResult, fResult] = await Promise.all([
        this.developer.runTasks('backend', milestoneId, backendTasks, backendContext),
        this.developer.runTasks('frontend', milestoneId, frontendTasks, frontendContext),
      ]);
      backendSuccess = bResult;
      frontendSuccess = fResult;
    } else {
      // Sequential: backend first, then frontend
      if (hasBackend) {
        backendSuccess = await this.developer.runTasks('backend', milestoneId, backendTasks, backendContext);
      }
      if (hasFrontend) {
        frontendSuccess = await this.developer.runTasks('frontend', milestoneId, frontendTasks, frontendContext);
      }
    }

    return { backendSuccess, frontendSuccess };
  }

  async dispatchFixes(
    milestoneId: string,
    findings: Finding[],
  ): Promise<boolean> {
    const backendFindings = findings.filter(f => f.assignee === 'backend');
    const frontendFindings = findings.filter(f => f.assignee === 'frontend');

    let success = true;

    if (backendFindings.length > 0) {
      const ok = await this.developer.runFix('backend', milestoneId, backendFindings);
      if (!ok) success = false;
    }

    if (frontendFindings.length > 0) {
      const ok = await this.developer.runFix('frontend', milestoneId, frontendFindings);
      if (!ok) success = false;
    }

    return success;
  }
}
