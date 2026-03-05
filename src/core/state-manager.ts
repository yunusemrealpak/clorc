import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { TaskQueue, TaskContext } from '../types/index.js';

export class StateManager {
  private agentDir: string;

  constructor(agentDir: string) {
    this.agentDir = resolve(agentDir);
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      this.agentDir,
      resolve(this.agentDir, 'shared'),
      resolve(this.agentDir, 'backend'),
      resolve(this.agentDir, 'frontend'),
      resolve(this.agentDir, 'review'),
      resolve(this.agentDir, 'clorc', 'logs'),
    ];
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // ─── Paths ─────────────────────────────────────────────

  private path(relative: string): string {
    return resolve(this.agentDir, relative);
  }

  // ─── Plan ──────────────────────────────────────────────

  readPlan(): string | null {
    const p = this.path('plan.md');
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }

  writePlan(content: string): void {
    writeFileSync(this.path('plan.md'), content, 'utf-8');
  }

  // ─── Task Queue ────────────────────────────────────────

  readTaskQueue(): TaskQueue | null {
    const p = this.path('task_queue.json');
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as TaskQueue;
    } catch {
      return null;
    }
  }

  writeTaskQueue(queue: TaskQueue): void {
    queue.updated_at = new Date().toISOString();
    writeFileSync(this.path('task_queue.json'), JSON.stringify(queue, null, 2), 'utf-8');
  }

  // ─── Decisions ─────────────────────────────────────────

  readDecisions(): string | null {
    const p = this.path('decisions.md');
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }

  writeDecisions(content: string): void {
    writeFileSync(this.path('decisions.md'), content, 'utf-8');
  }

  // ─── API Contract ──────────────────────────────────────

  readApiContract(): string | null {
    const p = this.path('shared/api_contract.md');
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }

  // ─── Progress ──────────────────────────────────────────

  readProgress(assignee: 'backend' | 'frontend'): string | null {
    const p = this.path(`${assignee}/progress.md`);
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }

  // ─── Review Reports ────────────────────────────────────

  readReviewReport(milestoneId: string): string | null {
    const dir = this.path('review');
    if (!existsSync(dir)) return null;

    // Find the latest review file for this milestone
    const files = readdirSync(dir) as string[];
    const matching = files
      .filter((f: string) => f.startsWith(`milestone-${milestoneId}`) && f.endsWith('.md'))
      .sort()
      .reverse();

    if (matching.length === 0) return null;
    return readFileSync(resolve(dir, matching[0]), 'utf-8');
  }

  getReviewReportPath(milestoneId: string): string {
    const date = new Date().toISOString().split('T')[0];
    return this.path(`review/milestone-${milestoneId}-${date}.md`);
  }

  writeReviewReport(milestoneId: string, content: string): void {
    const filePath = this.getReviewReportPath(milestoneId);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
  }

  // ─── Context Extraction ────────────────────────────────

  buildTaskContext(milestoneId: string, assignee: 'backend' | 'frontend'): TaskContext {
    const plan = this.readPlan() || '';
    const decisions = this.readDecisions() || '';
    const apiContract = this.readApiContract();
    const progress = this.readProgress(assignee);

    return {
      milestoneInfo: this.extractMilestoneSection(plan, milestoneId) || plan.slice(0, 2000),
      decisions: decisions.slice(0, 1500),
      apiContract: apiContract?.slice(0, 1000),
      progress: progress?.slice(0, 1000),
    };
  }

  private extractMilestoneSection(plan: string, milestoneId: string): string {
    // Try to extract relevant section (## Milestone X or ## MX)
    const escaped = milestoneId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(##\\s*(?:Milestone\\s*)?${escaped}[^\\n]*\\n[\\s\\S]*?)(?=\\n##\\s|$)`,
      'i',
    );
    const match = plan.match(regex);
    return match ? match[1].trim() : '';
  }

  // ─── Utilities ─────────────────────────────────────────

  getAgentDir(): string {
    return this.agentDir;
  }

  exists(relative: string): boolean {
    return existsSync(this.path(relative));
  }
}
