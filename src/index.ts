import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './utils/config.js';
import { LoopController } from './core/loop-controller.js';
import { EventBus } from './core/event-bus.js';
import { Spinner } from './utils/spinner.js';
import { DashboardServer } from './dashboard/server.js';
import type { ClorcConfig } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const version = getVersion();

const program = new Command()
  .name('clorc')
  .description('Claude Code Autonomous Multi-Agent Orchestrator')
  .version(version)
  .requiredOption('-m, --mission <prompt>', 'Mission prompt or @file.md to read from file')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--max-turns <n>', 'Max turns per agent', '75')
  .option('--max-fix-cycles <n>', 'Max fix cycles per milestone', '3')
  .option('--task-group-size <n>', 'Tasks per agent session (default: 3)', '3')
  .option('--no-parallel', 'Disable parallel agent execution')
  .option('--dashboard', 'Enable live dashboard (default: true)')
  .option('--no-dashboard', 'Disable live dashboard')
  .option('--port <port>', 'Dashboard port', '3400')
  .action(async (opts) => {
    const cwd = process.cwd();

    // Resolve mission: @file.md reads from file
    let mission: string = opts.mission;
    if (mission.startsWith('@')) {
      const filePath = resolve(cwd, mission.slice(1));
      if (!existsSync(filePath)) {
        console.error(`❌ Mission file not found: ${filePath}`);
        process.exit(1);
      }
      mission = readFileSync(filePath, 'utf-8').trim();
    }

    const cliOverrides: Partial<ClorcConfig> = {};

    if (opts.model) cliOverrides.model = opts.model;
    if (opts.maxTurns) cliOverrides.maxTurns = parseInt(opts.maxTurns);
    if (opts.maxFixCycles) cliOverrides.maxFixCycles = parseInt(opts.maxFixCycles);
    if (opts.taskGroupSize) cliOverrides.taskGroupSize = parseInt(opts.taskGroupSize);
    if (opts.parallel === false) cliOverrides.parallelAgents = false;
    if (opts.dashboard === false) cliOverrides.dashboard = false;
    if (opts.port) cliOverrides.dashboardPort = parseInt(opts.port);

    const config = loadConfig(cwd, cliOverrides);
    const bus = EventBus.getInstance();
    const spinner = new Spinner();
    const controller = new LoopController(config, cwd);

    // Dashboard
    let dashboard: DashboardServer | null = null;
    if (config.dashboard) {
      try {
        dashboard = new DashboardServer(config.dashboardPort);
        dashboard.start();
      } catch {
        // Dashboard failed to start — continue without it
      }
    }

    // Console output header
    console.log(`\n🎼 clorc v${version}`);
    if (dashboard) {
      console.log(`🌐 Dashboard: http://localhost:${config.dashboardPort}`);
    }
    console.log('━'.repeat(38));
    console.log('');

    // Subscribe to events for console output
    bus.onEvent('plan:created', (p) => {
      spinner.stop(`✓ Plan created: ${p.milestones.length} milestones, ${p.taskCount} tasks`);
    });

    bus.onEvent('milestone:start', (p) => {
      console.log(`\n🏗  Milestone ${p.index}/${p.total}: ${p.title}`);
    });

    bus.onEvent('agent:start', (p) => {
      if (p.agent === 'orchestrator') {
        spinner.start('Planning...');
      } else if (p.agent === 'reviewer') {
        spinner.start('Reviewer...');
      } else {
        const taskIds = p.tasks.join(', ');
        spinner.start(`${capitalize(p.agent)} Agent (${taskIds})...`);
      }
    });

    bus.onEvent('agent:done', (p) => {
      if (p.agent === 'orchestrator') return; // handled by plan:created
      const duration = formatDuration(p.duration);
      const icon = p.success ? '✓' : '✗';
      spinner.stop(`${icon} ${capitalize(p.agent)} done (${duration})`);
    });

    bus.onEvent('review:done', (p) => {
      if (p.verdict === 'PASS') {
        spinner.stop(`✓ No findings`);
      } else {
        const counts = summarizeFindings(p.findings);
        spinner.stop(`${counts}`);
      }
    });

    bus.onEvent('fix:start', (p) => {
      console.log(`   🔧 Fix cycle ${p.cycle}/${config.maxFixCycles}`);
    });

    bus.onEvent('verify:done', (p) => {
      if (p.verdict === 'PASS') {
        spinner.stop('✓ All findings resolved');
      }
    });

    bus.onEvent('milestone:done', (p) => {
      if (p.status === 'done') {
        console.log(`   ✅ Milestone ${p.id} closed`);
      } else {
        console.log(`   ⚠️  Milestone ${p.id} needs manual review`);
      }
    });

    bus.onEvent('error', (p) => {
      spinner.stop(`❌ Error: ${p.message}`);
    });

    // Shutdown handling — covers all exit scenarios
    let shuttingDown = false;
    const handleShutdown = (reason?: string) => {
      if (shuttingDown) {
        // Second signal = force kill
        controller.abort();
        process.exit(1);
      }
      shuttingDown = true;
      spinner.stop('⛔ Shutting down...');
      controller.abort();
      if (dashboard) dashboard.stop();
      console.log('\n🛑 clorc stopped. State files preserved.');
      process.exit(0);
    };

    // Ctrl+C
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    // kill command
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    // Terminal closed (Windows terminal close / SSH disconnect)
    process.on('SIGHUP', () => handleShutdown('SIGHUP'));
    // Ensure child processes are killed on ANY exit
    process.on('exit', () => {
      // exit handler is sync-only — kill is sync (taskkill/process.kill)
      controller.abort();
    });
    // Uncaught errors — kill children before crashing
    process.on('uncaughtException', (err) => {
      console.error(`\n❌ Uncaught exception: ${err.message}`);
      controller.abort();
      if (dashboard) dashboard.stop();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error(`\n❌ Unhandled rejection: ${reason}`);
      controller.abort();
      if (dashboard) dashboard.stop();
      process.exit(1);
    });

    // Run
    const startTime = Date.now();
    try {
      await controller.run(mission);
    } catch (err) {
      spinner.stop('');
      console.error(`\n❌ Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }

    // Final output
    const totalDuration = Date.now() - startTime;
    console.log('\n' + '━'.repeat(38));

    bus.onEvent('mission:done', (p) => {
      const icon = p.milestonesCompleted === p.total ? '✅' : '⚠️';
      console.log(`${icon} Mission complete! ${p.milestonesCompleted}/${p.total} milestones closed.`);
      console.log(`⏱  Total time: ${formatDuration(totalDuration)}`);
      console.log(`📄 Full log: ${controller.getLogger().getLogFile()}`);
    });

    // Cleanup
    if (dashboard) dashboard.stop();
  });

program.parse();

// ─── Helpers ─────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function summarizeFindings(findings: Array<{ severity: string }>): string {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  const parts: string[] = [];
  if (counts['critical']) parts.push(`${counts['critical']} critical`);
  if (counts['major']) parts.push(`${counts['major']} major`);
  if (counts['minor']) parts.push(`${counts['minor']} minor`);
  const total = findings.length;
  return `${total} finding${total !== 1 ? 's' : ''} (${parts.join(', ')})`;
}
