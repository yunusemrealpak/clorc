import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { EventBus } from '../core/event-bus.js';
import type { ClorcEvent } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DashboardServer {
  private port: number;
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  constructor(port: number) {
    this.port = port;
  }

  start(): void {
    const htmlContent = this.loadHtml();

    this.httpServer = createServer((req, res) => {
      if (req.url === '/' || req.url === '') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      // Send snapshot with event history
      const bus = EventBus.getInstance();
      const snapshot = {
        type: 'snapshot',
        payload: {
          events: bus.getHistory(),
        },
      };
      ws.send(JSON.stringify(snapshot));

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    // Subscribe to all events and broadcast
    const bus = EventBus.getInstance();
    bus.onAny((event: ClorcEvent) => {
      const message = JSON.stringify(event);
      for (const client of this.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
        }
      }
    });

    this.httpServer.listen(this.port);
  }

  stop(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }

  private loadHtml(): string {
    // After tsup bundles everything into dist/index.js, __dirname = dist/
    // HTML is at dist/dashboard/index.html
    const candidates = [
      resolve(__dirname, 'dashboard', 'index.html'),
      resolve(__dirname, '..', 'src', 'dashboard', 'index.html'),
      resolve(__dirname, 'index.html'),
    ];

    for (const htmlPath of candidates) {
      try {
        return readFileSync(htmlPath, 'utf-8');
      } catch {
        continue;
      }
    }

    return this.getFallbackHtml();
  }

  private getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html><head><title>clorc Dashboard</title></head>
<body style="background:#1a1a2e;color:#e0e0e0;font-family:monospace;padding:20px">
<h1>clorc Dashboard</h1>
<p>Dashboard HTML not found. The dashboard will be available after building.</p>
</body></html>`;
  }
}
