import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { EventBus } from '../core/event-bus.js';
import type { ClorcEvent } from '../types/index.js';

export class Logger {
  private logFile: string;
  private agentLogDir: string;
  private agentLogCounter = 0;

  constructor(agentDir: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logDir = resolve(agentDir, 'clorc', 'logs');
    mkdirSync(logDir, { recursive: true });

    this.logFile = resolve(logDir, `${timestamp}.log`);
    this.agentLogDir = resolve(logDir, `${timestamp}-agents`);
    mkdirSync(this.agentLogDir, { recursive: true });

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    const bus = EventBus.getInstance();

    // Write all events to the main log file
    bus.onAny((event: ClorcEvent) => {
      this.writeToFile(this.formatEvent(event));
    });

    // Write each agent's full output to a separate file in the agents directory
    bus.onEvent('agent:done', (payload) => {
      const suffix = payload.agent === 'reviewer' ? '' : '';
      this.writeAgentLog(payload.agent, payload.milestone, payload.output || '(no output)', suffix);
    });
  }

  private formatEvent(event: ClorcEvent): string {
    const time = new Date().toISOString();
    return `[${time}] ${event.type}: ${JSON.stringify(event.payload)}\n`;
  }

  private writeToFile(line: string): void {
    try {
      appendFileSync(this.logFile, line, 'utf-8');
    } catch {
      // Silently fail — don't crash for logging issues
    }
  }

  writeAgentLog(agent: string, milestone: string, content: string, suffix = ''): string {
    this.agentLogCounter++;
    const padded = String(this.agentLogCounter).padStart(2, '0');
    const name = suffix
      ? `${padded}-${agent}-${suffix}-${milestone}.txt`
      : `${padded}-${agent}-${milestone}.txt`;
    const filePath = resolve(this.agentLogDir, name);

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(filePath, content, 'utf-8');
    } catch {
      // Silently fail
    }

    return filePath;
  }

  info(message: string): void {
    this.writeToFile(`[${new Date().toISOString()}] INFO: ${message}\n`);
  }

  error(message: string): void {
    this.writeToFile(`[${new Date().toISOString()}] ERROR: ${message}\n`);
  }

  getLogFile(): string {
    return this.logFile;
  }
}
