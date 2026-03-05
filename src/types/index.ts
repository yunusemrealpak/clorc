// ─── Agent Types ───────────────────────────────────────────

export type AgentType = 'orchestrator' | 'backend' | 'frontend' | 'reviewer';

// ─── ClaudeRunner ──────────────────────────────────────────

export interface ClaudeRunnerOptions {
  prompt: string;
  systemPromptFile?: string;
  maxTurns?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
  workingDirectory?: string;
  timeout?: number;
  allowedTools?: string[];
  model?: string;
  resumeSessionId?: string;
}

export interface ClaudeRunnerResult {
  success: boolean;
  output: string;
  stderr?: string;
  exitCode: number;
  duration: number;
  sessionId?: string;
}

// ─── Task Queue ────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'blocked';
export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'needs_manual_review';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface Milestone {
  id: string;
  name: string;
  description: string;
  done_criteria: string;
  backend_tasks: string[];
  frontend_tasks: string[];
  status: MilestoneStatus;
  review_cycles: number;
}

export interface Task {
  id: string;
  milestone: string;
  title: string;
  description: string;
  assignee: 'backend' | 'frontend';
  status: TaskStatus;
  priority: 'high' | 'medium' | 'low';
  dependencies: string[];
  acceptance_criteria: string[];
  notes: string;
}

export interface TaskQueue {
  version: number;
  updated_at: string;
  milestones: Record<string, {
    name: string;
    description: string;
    done_criteria: string;
    backend_tasks: string[];
    frontend_tasks: string[];
  }>;
  tasks: Task[];
}

// ─── Review ────────────────────────────────────────────────

export interface Finding {
  id: string;
  severity: FindingSeverity;
  assignee: 'backend' | 'frontend';
  description: string;
  suggestion: string;
  file?: string;
  status?: 'open' | 'fixed' | 'not_fixed';
}

export interface ReviewResult {
  verdict: 'PASS' | 'FAIL';
  findings: Finding[];
  verificationRounds: VerificationRound[];
}

export interface VerificationRound {
  round: number;
  results: Array<{
    findingId: string;
    status: 'fixed' | 'not_fixed';
    reason?: string;
  }>;
  verdict: 'PASS' | 'FAIL';
}

// ─── Config ────────────────────────────────────────────────

export interface ClorcConfig {
  model: string;
  maxTurns: number;
  maxFixCycles: number;
  parallelAgents: boolean;
  taskGroupSize: number;
  timeout: number;
  skillsDir: string;
  agentDir: string;
  dashboard: boolean;
  dashboardPort: number;
}

export interface TaskContext {
  milestoneInfo: string;
  decisions: string;
  apiContract?: string;
  progress?: string;
}

// ─── Events ────────────────────────────────────────────────

export type ClorcEvent =
  | { type: 'mission:start'; payload: { mission: string; timestamp: string } }
  | { type: 'plan:created'; payload: { milestones: Array<{ id: string; name: string }>; taskCount: number } }
  | { type: 'milestone:start'; payload: { id: string; title: string; index: number; total: number } }
  | { type: 'milestone:done'; payload: { id: string; status: 'done' | 'needs_manual_review' } }
  | { type: 'agent:start'; payload: { agent: AgentType; milestone: string; tasks: string[]; prompt: string } }
  | { type: 'agent:output'; payload: { agent: AgentType; milestone: string; chunk: string } }
  | { type: 'agent:done'; payload: { agent: AgentType; milestone: string; duration: number; success: boolean; output: string } }
  | { type: 'review:start'; payload: { milestone: string } }
  | { type: 'review:done'; payload: { milestone: string; verdict: 'PASS' | 'FAIL'; findings: Finding[] } }
  | { type: 'fix:start'; payload: { milestone: string; cycle: number; findings: Finding[] } }
  | { type: 'fix:done'; payload: { milestone: string; cycle: number } }
  | { type: 'verify:start'; payload: { milestone: string; cycle: number } }
  | { type: 'verify:done'; payload: { milestone: string; cycle: number; verdict: 'PASS' | 'FAIL' } }
  | { type: 'mission:done'; payload: { duration: number; milestonesCompleted: number; total: number } }
  | { type: 'error'; payload: { message: string; phase: string; recoverable: boolean } };

export type ClorcEventType = ClorcEvent['type'];

// Helper type to extract payload by event type
export type EventPayload<T extends ClorcEventType> = Extract<ClorcEvent, { type: T }>['payload'];
