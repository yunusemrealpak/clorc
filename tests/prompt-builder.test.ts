import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../src/core/prompt-builder.js';
import type { Task, Finding, TaskContext } from '../src/types/index.js';

describe('PromptBuilder', () => {
  const builder = new PromptBuilder();

  const sampleContext: TaskContext = {
    milestoneInfo: '## M1 - Auth System\nBuild auth with JWT.',
    decisions: 'Use bcrypt for password hashing.',
    apiContract: 'POST /api/login -> { token }',
    progress: 'Set up project skeleton.',
  };

  it('builds orchestrator prompt with mission', () => {
    const prompt = builder.buildOrchestratorPrompt('Build auth system');
    expect(prompt).toContain('Build auth system');
    expect(prompt).toContain('.agent/');
    expect(prompt).toContain('plan.md');
    expect(prompt).toContain('task_queue.json');
  });

  it('builds group task prompt with context injection (first group)', () => {
    const tasks: Task[] = [
      { id: 'T001', milestone: 'M1', title: 'Create API', description: 'Build REST API', assignee: 'backend', status: 'pending', priority: 'high', dependencies: [], acceptance_criteria: [], notes: '' },
      { id: 'T002', milestone: 'M1', title: 'Add auth', description: 'Add JWT auth', assignee: 'backend', status: 'pending', priority: 'high', dependencies: ['T001'], acceptance_criteria: [], notes: '' },
    ];

    const prompt = builder.buildGroupTaskPrompt('backend', 'M1', tasks, sampleContext, false);

    // Context should be embedded
    expect(prompt).toContain('# Project Context');
    expect(prompt).toContain('Auth System');
    expect(prompt).toContain('bcrypt');
    expect(prompt).toContain('POST /api/login');
    expect(prompt).toContain('Set up project skeleton');

    // Tasks should be listed
    expect(prompt).toContain('[T001]');
    expect(prompt).toContain('[T002]');
    expect(prompt).toContain('Create API');

    // Should NOT tell agent to read .agent files
    expect(prompt).toContain('do NOT spend turns reading .agent/ planning files');
  });

  it('builds group task prompt without context (resumed session)', () => {
    const tasks: Task[] = [
      { id: 'T003', milestone: 'M1', title: 'Add tests', description: 'Write unit tests', assignee: 'backend', status: 'pending', priority: 'medium', dependencies: [], acceptance_criteria: [], notes: '' },
    ];

    const prompt = builder.buildGroupTaskPrompt('backend', 'M1', tasks, sampleContext, true);

    // Context should NOT be embedded
    expect(prompt).not.toContain('# Project Context');
    expect(prompt).not.toContain('bcrypt');

    // Task should still be listed
    expect(prompt).toContain('[T003]');
    expect(prompt).toContain('Add tests');
  });

  it('builds single task prompt (legacy fallback)', () => {
    const task: Task = { id: 'T001', milestone: 'M1', title: 'Create API', description: 'Build REST API', assignee: 'backend', status: 'pending', priority: 'high', dependencies: [], acceptance_criteria: [], notes: '' };

    const prompt = builder.buildSingleTaskPrompt('backend', 'M1', task);
    expect(prompt).toContain('Milestone M1');
    expect(prompt).toContain('[T001]');
    expect(prompt).toContain('Create API');
    expect(prompt).toContain('feat(backend)');
    expect(prompt).toContain('tek task');
  });

  it('builds review prompt', () => {
    const backendTasks: Task[] = [
      { id: 'T001', milestone: 'M1', title: 'Create API', description: '', assignee: 'backend', status: 'done', priority: 'high', dependencies: [], acceptance_criteria: [], notes: '' },
    ];

    const prompt = builder.buildReviewPrompt('M1', backendTasks, []);
    expect(prompt).toContain('Milestone M1');
    expect(prompt).toContain('[T001]');
    expect(prompt).toContain('PASS');
    expect(prompt).toContain('FAIL');
  });

  it('builds verification prompt', () => {
    const prompt = builder.buildVerificationPrompt('M1', ['R001', 'R002']);
    expect(prompt).toContain('R001, R002');
    expect(prompt).toContain('Verification Round');
  });

  it('builds fix prompt', () => {
    const findings: Finding[] = [
      { id: 'R001', severity: 'critical', assignee: 'backend', description: 'Missing validation', suggestion: 'Add input validation' },
    ];

    const prompt = builder.buildFixPrompt('backend', findings);
    expect(prompt).toContain('[R001]');
    expect(prompt).toContain('Missing validation');
    expect(prompt).toContain('Add input validation');
  });
});
