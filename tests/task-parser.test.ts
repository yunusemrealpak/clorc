import { describe, it, expect } from 'vitest';
import {
  getTasksByMilestone,
  getTasksByAssignee,
  getPendingTasks,
  updateTaskStatus,
  getMilestoneIds,
  isMilestoneComplete,
  formatTaskList,
} from '../src/parsers/task-parser.js';
import type { TaskQueue } from '../src/types/index.js';

const mockQueue: TaskQueue = {
  version: 1,
  updated_at: '2026-01-01',
  milestones: {
    M1: { name: 'Milestone 1', description: '', done_criteria: '', backend_tasks: ['T001'], frontend_tasks: ['T101'] },
    M2: { name: 'Milestone 2', description: '', done_criteria: '', backend_tasks: ['T002'], frontend_tasks: [] },
  },
  tasks: [
    { id: 'T001', milestone: 'M1', title: 'Backend task 1', description: 'Desc', assignee: 'backend', status: 'done', priority: 'high', dependencies: [], acceptance_criteria: [], notes: '' },
    { id: 'T101', milestone: 'M1', title: 'Frontend task 1', description: 'Desc', assignee: 'frontend', status: 'pending', priority: 'high', dependencies: ['T001'], acceptance_criteria: [], notes: '' },
    { id: 'T002', milestone: 'M2', title: 'Backend task 2', description: 'Desc', assignee: 'backend', status: 'pending', priority: 'medium', dependencies: [], acceptance_criteria: [], notes: '' },
  ],
};

describe('TaskParser', () => {
  it('getTasksByMilestone returns correct tasks', () => {
    const tasks = getTasksByMilestone(mockQueue, 'M1');
    expect(tasks).toHaveLength(2);
  });

  it('getTasksByAssignee filters correctly', () => {
    const tasks = getTasksByAssignee(mockQueue, 'M1', 'backend');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T001');
  });

  it('getPendingTasks returns non-done tasks', () => {
    const tasks = getPendingTasks(mockQueue, 'M1', 'frontend');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T101');
  });

  it('updateTaskStatus creates new queue with updated status', () => {
    const updated = updateTaskStatus(mockQueue, 'T101', 'done');
    expect(updated.tasks.find(t => t.id === 'T101')?.status).toBe('done');
    // Original unchanged
    expect(mockQueue.tasks.find(t => t.id === 'T101')?.status).toBe('pending');
  });

  it('getMilestoneIds returns sorted IDs', () => {
    const ids = getMilestoneIds(mockQueue);
    expect(ids).toEqual(['M1', 'M2']);
  });

  it('isMilestoneComplete returns false when tasks pending', () => {
    expect(isMilestoneComplete(mockQueue, 'M1')).toBe(false);
  });

  it('isMilestoneComplete returns true when all done', () => {
    const updated = updateTaskStatus(mockQueue, 'T101', 'done');
    expect(isMilestoneComplete(updated, 'M1')).toBe(true);
  });

  it('formatTaskList creates readable list', () => {
    const tasks = getTasksByMilestone(mockQueue, 'M1');
    const formatted = formatTaskList(tasks);
    expect(formatted).toContain('[T001]');
    expect(formatted).toContain('[T101]');
  });
});
