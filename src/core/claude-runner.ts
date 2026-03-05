import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from './event-bus.js';
import type { ClaudeRunnerOptions, ClaudeRunnerResult, AgentType } from '../types/index.js';

const RATE_LIMIT_DELAYS = [30000, 60000, 120000];

export class ClaudeRunner {
  private activeProcesses: Set<ChildProcess> = new Set();
  private rateLimitRetries = 0;

  buildFlags(options: ClaudeRunnerOptions): string[] {
    const flags: string[] = [
      '--dangerously-skip-permissions',
      '--output-format', options.outputFormat || 'text',
      '--max-turns', String(options.maxTurns || 25),
      '--model', options.model || 'sonnet',
    ];

    if (options.resumeSessionId) {
      flags.push('--resume', options.resumeSessionId);
    }

    if (options.systemPromptFile) {
      flags.push('--append-system-prompt-file', `"${options.systemPromptFile}"`);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      flags.push('--allowedTools', options.allowedTools.join(','));
    }

    return flags;
  }

  async runWithRetry(
    options: ClaudeRunnerOptions,
    agentType?: AgentType,
    milestone?: string,
    maxRetries = 1,
  ): Promise<ClaudeRunnerResult> {
    let lastResult: ClaudeRunnerResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.run(options, agentType, milestone);

      if (result.success) {
        this.rateLimitRetries = 0;
        return result;
      }

      // Rate limit detection
      if (this.isRateLimited(result)) {
        const delay = RATE_LIMIT_DELAYS[Math.min(this.rateLimitRetries, RATE_LIMIT_DELAYS.length - 1)];
        this.rateLimitRetries++;
        const bus = EventBus.getInstance();
        bus.emitEvent('error', {
          message: `Rate limited. Waiting ${delay / 1000}s before retry...`,
          phase: 'agent-execution',
          recoverable: true,
        });
        await this.sleep(delay);
        attempt--; // Don't count rate limit retries against max retries
        continue;
      }

      lastResult = result;

      if (attempt < maxRetries) {
        const bus = EventBus.getInstance();
        bus.emitEvent('error', {
          message: `Agent failed (exit ${result.exitCode}), retrying (${attempt + 1}/${maxRetries})...\n      stdout: ${result.output.slice(0, 300)}\n      stderr: ${result.stderr?.slice(0, 300) || '(empty)'}`,
          phase: 'agent-execution',
          recoverable: true,
        });
      }
    }

    return lastResult!;
  }

  private isRateLimited(result: ClaudeRunnerResult): boolean {
    const text = result.output + (result.stderr || '');
    return text.includes('rate limit') ||
           text.includes('Rate limit') ||
           text.includes('429') ||
           result.exitCode === 429;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run(
    options: ClaudeRunnerOptions,
    agentType?: AgentType,
    milestone?: string,
  ): Promise<ClaudeRunnerResult> {
    const flags = this.buildFlags(options);
    const bus = EventBus.getInstance();
    const startTime = Date.now();
    const isStreamJson = options.outputFormat === 'stream-json';

    // Write prompt to temp file to avoid shell escaping issues
    const tempFile = join(tmpdir(), `clorc-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    writeFileSync(tempFile, options.prompt, 'utf-8');

    const catCmd = process.platform === 'win32' ? 'type' : 'cat';
    const shellCommand = `${catCmd} "${tempFile}" | claude ${flags.join(' ')}`;

    return new Promise<ClaudeRunnerResult>((resolve) => {
      const child = spawn(shellCommand, {
        cwd: options.workingDirectory || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });

      this.activeProcesses.add(child);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // For stream-json: accumulate text and capture session_id
      let streamText = '';
      let streamSessionId: string | undefined;
      let lineBuffer = '';

      const timeoutMs = options.timeout || 600000;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        if (isStreamJson) {
          // Parse stream-json line by line, emit text chunks for live streaming
          lineBuffer += chunk;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || ''; // keep incomplete last line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const obj = JSON.parse(trimmed);

              if (obj.type === 'assistant' && obj.subtype === 'text' && obj.text) {
                streamText += obj.text;
                if (agentType && milestone) {
                  bus.emitEvent('agent:output', { agent: agentType, milestone, chunk: obj.text });
                }
              } else if (obj.type === 'result') {
                streamSessionId = obj.session_id || obj.conversation_id;
                if (typeof obj.result === 'string') {
                  streamText = obj.result;
                }
              }
            } catch { /* skip unparseable lines */ }
          }
        } else {
          // text format: emit raw chunks directly
          if (agentType && milestone) {
            bus.emitEvent('agent:output', { agent: agentType, milestone, chunk });
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(child);
        this.cleanupTempFile(tempFile);
        const duration = Date.now() - startTime;
        const exitCode = code ?? 1;

        if (timedOut) {
          resolve({
            success: false,
            output: streamText || stdout || stderr || 'Process timed out',
            stderr,
            exitCode: 124,
            duration,
          });
          return;
        }

        // Process any remaining buffered line
        if (isStreamJson && lineBuffer.trim()) {
          try {
            const obj = JSON.parse(lineBuffer.trim());
            if (obj.type === 'result') {
              streamSessionId = obj.session_id || obj.conversation_id;
              if (typeof obj.result === 'string') streamText = obj.result;
            } else if (obj.type === 'assistant' && obj.subtype === 'text' && obj.text) {
              streamText += obj.text;
            }
          } catch { /* ignore */ }
        }

        if (isStreamJson) {
          resolve({
            success: exitCode === 0,
            output: streamText || stdout,
            stderr,
            exitCode,
            duration,
            sessionId: streamSessionId,
          });
        } else {
          const parsed = this.tryParseJsonOutput(stdout, options.outputFormat);
          resolve({
            success: exitCode === 0,
            output: parsed.text,
            stderr,
            exitCode,
            duration,
            sessionId: parsed.sessionId,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(child);
        this.cleanupTempFile(tempFile);
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          output: err.message,
          stderr: err.message,
          exitCode: 1,
          duration,
        });
      });
    });
  }

  private tryParseJsonOutput(
    stdout: string,
    format?: string,
  ): { text: string; sessionId?: string } {
    if (format !== 'json') return { text: stdout };

    try {
      const parsed = JSON.parse(stdout);
      return {
        text: typeof parsed.result === 'string' ? parsed.result : stdout,
        sessionId: parsed.session_id || parsed.conversation_id,
      };
    } catch {
      return { text: stdout };
    }
  }

  private cleanupTempFile(filePath: string): void {
    try { unlinkSync(filePath); } catch { /* ignore */ }
  }

  kill(): void {
    for (const proc of this.activeProcesses) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 5000);
      }
    }
  }

  isRunning(): boolean {
    return this.activeProcesses.size > 0;
  }
}
