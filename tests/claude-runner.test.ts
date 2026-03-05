import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeRunner } from '../src/core/claude-runner.js';
import { EventBus } from '../src/core/event-bus.js';

describe('ClaudeRunner', () => {
  beforeEach(() => {
    EventBus.resetInstance();
  });

  it('builds flags with minimal options', () => {
    const runner = new ClaudeRunner();
    const flags = runner.buildFlags({
      prompt: 'Hello world',
    });

    expect(flags).toContain('--output-format');
    expect(flags).toContain('text');
    expect(flags).toContain('--max-turns');
    expect(flags).toContain('25');
    expect(flags).toContain('--model');
    expect(flags).toContain('sonnet');
    expect(flags.join(' ')).not.toContain('Hello world');
    expect(flags).not.toContain('-p');
  });

  it('builds flags with system prompt file', () => {
    const runner = new ClaudeRunner();
    const flags = runner.buildFlags({
      prompt: 'Hello',
      systemPromptFile: '/path/to/skill.md',
    });

    expect(flags.join(' ')).toContain('--append-system-prompt-file');
    expect(flags.join(' ')).toContain('/path/to/skill.md');
  });

  it('builds flags with custom model and turns', () => {
    const runner = new ClaudeRunner();
    const flags = runner.buildFlags({
      prompt: 'Hello',
      model: 'opus',
      maxTurns: 50,
    });

    expect(flags).toContain('opus');
    expect(flags).toContain('50');
  });

  it('builds flags with allowed tools', () => {
    const runner = new ClaudeRunner();
    const flags = runner.buildFlags({
      prompt: 'Hello',
      allowedTools: ['Read', 'Write', 'Bash'],
    });

    expect(flags).toContain('--allowedTools');
    expect(flags).toContain('Read,Write,Bash');
  });

  it('builds flags with resume session ID', () => {
    const runner = new ClaudeRunner();
    const flags = runner.buildFlags({
      prompt: 'Continue working',
      resumeSessionId: 'abc-123-def',
    });

    expect(flags).toContain('--resume');
    expect(flags).toContain('abc-123-def');
  });

  it('isRunning returns false initially', () => {
    const runner = new ClaudeRunner();
    expect(runner.isRunning()).toBe(false);
  });
});
