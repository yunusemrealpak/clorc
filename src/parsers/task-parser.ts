import type { Task, TaskQueue, TaskStatus } from '../types/index.js';

export function getTasksByMilestone(queue: TaskQueue, milestoneId: string): Task[] {
  return queue.tasks.filter(t => t.milestone === milestoneId);
}

export function getTasksByAssignee(
  queue: TaskQueue,
  milestoneId: string,
  assignee: 'backend' | 'frontend',
): Task[] {
  return queue.tasks.filter(
    t => t.milestone === milestoneId && t.assignee === assignee,
  );
}

export function getPendingTasks(
  queue: TaskQueue,
  milestoneId: string,
  assignee: 'backend' | 'frontend',
): Task[] {
  return getTasksByAssignee(queue, milestoneId, assignee).filter(
    t => t.status === 'pending' || t.status === 'in_progress',
  );
}

export function areDependenciesResolved(task: Task, queue: TaskQueue): boolean {
  if (task.dependencies.length === 0) return true;
  return task.dependencies.every(depId => {
    const dep = queue.tasks.find(t => t.id === depId);
    return dep?.status === 'done';
  });
}

export function updateTaskStatus(
  queue: TaskQueue,
  taskId: string,
  status: TaskStatus,
): TaskQueue {
  return {
    ...queue,
    updated_at: new Date().toISOString(),
    tasks: queue.tasks.map(t =>
      t.id === taskId ? { ...t, status } : t,
    ),
  };
}

export function getMilestoneIds(queue: TaskQueue): string[] {
  return Object.keys(queue.milestones).sort();
}

export function isMilestoneComplete(queue: TaskQueue, milestoneId: string): boolean {
  const tasks = getTasksByMilestone(queue, milestoneId);
  return tasks.length > 0 && tasks.every(t => t.status === 'done');
}

export function formatTaskList(tasks: Task[]): string {
  return tasks
    .map(t => `- [${t.id}] ${t.title}: ${t.description}`)
    .join('\n');
}
