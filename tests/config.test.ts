import { describe, it, expect } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/utils/config.js';
import { resolve } from 'node:path';

describe('Config', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.taskGroupSize).toBe(3);
  });

  it('CLI overrides take precedence', () => {
    const config = loadConfig('/nonexistent/path', {
      model: 'opus',
      maxFixCycles: 5,
      dashboard: false,
    });

    expect(config.model).toBe('opus');
    expect(config.maxFixCycles).toBe(5);
    expect(config.dashboard).toBe(false);
    // Defaults still apply for non-overridden
    expect(config.maxTurns).toBe(DEFAULT_CONFIG.maxTurns);
  });
});
