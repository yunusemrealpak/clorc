import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClorcConfig } from '../types/index.js';

const DEFAULT_CONFIG: ClorcConfig = {
  model: 'sonnet',
  maxTurns: 75,
  maxFixCycles: 3,
  parallelAgents: true,
  taskGroupSize: 3,
  timeout: 600000,
  skillsDir: '.claude/skills',
  agentDir: '.agent',
  dashboard: true,
  dashboardPort: 3400,
};

export function loadConfig(cwd: string, cliOverrides: Partial<ClorcConfig> = {}): ClorcConfig {
  const configPath = resolve(cwd, '.clorc.json');
  let fileConfig: Partial<ClorcConfig> = {};

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Invalid config file — use defaults
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...cliOverrides,
  };
}

export { DEFAULT_CONFIG };
