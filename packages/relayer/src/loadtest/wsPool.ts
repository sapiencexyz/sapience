/**
 * WebSocket connection pool with staggered connect, correlated latency tracking,
 * keepalive, and clean shutdown.
 */

import WebSocket from 'ws';
import type { MetricsCollector } from './metrics';

export interface WsConnection {
  id: number;
  ws: WebSocket;
  sendTime: Map<string, number>; // correlationKey -> sendTimestamp
}

export interface WsPoolStats {
  active: number;
  failed: number;
  rateLimited: number;
  msgsSent: number;
  msgsRecv: number;
}

interface PendingResponse {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WsPool {
  private connections: WsConnection[] = [];
  private stats: WsPoolStats = {
    active: 0,
    failed: 0,
    rateLimited: 0,
    msgsSent: 0,
    msgsRecv: 0,
  };
  private pendingResponses = new Map<string, PendingResponse>();
  private msgCounter = 0;
  private keepaliveIntervals: ReturnType<typeof setInterval>[] = [];
  private messageHandlers: ((
    conn: WsConnection,
    msg: Record<string, unknown>
  ) => void)[] = [];

  constructor(
    private readonly url: string,
    private readonly metrics: MetricsCollector
  ) {}

  get poolStats(): WsPoolStats {
    return { ...this.stats };
  }

  get size(): number {
    return this.connections.length;
  }

  get activeConnections(): WsConnection[] {
    return this.connections.filter((c) => c.ws.readyState === WebSocket.OPEN);
  }

  onMessage(
    handler: (conn: WsConnection, msg: Record<string, unknown>) => void
  ): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Open N connections with staggered delay to avoid thundering herd.
   */
  async connect(count: number, staggerMs = 10): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(this.openConnection(i));
      if (i < count - 1 && staggerMs > 0) {
        await delay(staggerMs);
      }
    }

    await Promise.allSettled(promises);
  }

  private openConnection(id: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = Date.now();
      const ws = new WebSocket(this.url);
      const conn: WsConnection = { id, ws, sendTime: new Map() };

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          this.stats.failed++;
          ws.terminate();
          resolve();
        }
      }, 10000);

      ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.metrics.record('ws_connect', Date.now() - startTime);
        this.connections.push(conn);
        this.stats.active++;

        // Keepalive ping every 30s
        const interval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
        this.keepaliveIntervals.push(interval);

        resolve();
      });

      ws.on('message', (data: WebSocket.RawData) => {
        this.stats.msgsRecv++;
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          this.handleMessage(conn, msg);
        } catch {
          // ignore parse errors
        }
      });

      ws.on('error', () => {
        clearTimeout(connectTimeout);
        this.stats.failed++;
        resolve();
      });

      ws.on('close', (code) => {
        this.stats.active = Math.max(0, this.stats.active - 1);
        if (code === 1008 || code === 4029) {
          this.stats.rateLimited++;
        }
        const idx = this.connections.indexOf(conn);
        if (idx >= 0) this.connections.splice(idx, 1);
      });
    });
  }

  private handleMessage(
    conn: WsConnection,
    msg: Record<string, unknown>
  ): void {
    const msgType = msg.type as string;
    const payload = msg.payload as Record<string, unknown> | undefined;

    // Resolve pending sendAndWait calls
    if (msgType === 'auction.ack' && payload?.auctionId) {
      const key = `auction.start:${conn.id}:pending`;
      const pending = this.pendingResponses.get(key);
      if (pending) {
        this.pendingResponses.delete(key);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      }
      // Track latency
      const sendKey = `auction.start:${conn.id}`;
      const sendTs = conn.sendTime.get(sendKey);
      if (sendTs) {
        this.metrics.record('auction.start->ack', Date.now() - sendTs);
        conn.sendTime.delete(sendKey);
      }
    }

    if (msgType === 'bid.ack') {
      const key = `bid.submit:${conn.id}:pending`;
      const pending = this.pendingResponses.get(key);
      if (pending) {
        this.pendingResponses.delete(key);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      }
      const sendKey = `bid.submit:${conn.id}`;
      const sendTs = conn.sendTime.get(sendKey);
      if (sendTs) {
        this.metrics.record('bid.submit->ack', Date.now() - sendTs);
        conn.sendTime.delete(sendKey);
      }
    }

    // Track broadcast latency for auction.bids (fanout)
    if (msgType === 'auction.bids' && payload?.auctionId) {
      const auctionId = payload.auctionId as string;
      const sendKey = `bid.broadcast:${auctionId}`;
      const sendTs = conn.sendTime.get(sendKey);
      if (sendTs) {
        this.metrics.record('bid->broadcast', Date.now() - sendTs);
        conn.sendTime.delete(sendKey);
      }
    }

    // Notify external handlers
    for (const handler of this.messageHandlers) {
      handler(conn, msg);
    }
  }

  /**
   * Send a message on a specific connection (fire and forget).
   */
  send(conn: WsConnection, message: unknown): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    conn.ws.send(JSON.stringify(message));
    this.stats.msgsSent++;
  }

  /**
   * Send a message and wait for a response of the given type.
   */
  sendAndWait(
    conn: WsConnection,
    message: { type: string; payload?: unknown },
    timeout = 10000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Connection not open'));
        return;
      }

      const key = `${message.type}:${conn.id}:pending`;
      const sendKey = `${message.type}:${conn.id}`;
      conn.sendTime.set(sendKey, Date.now());

      const timer = setTimeout(() => {
        this.pendingResponses.delete(key);
        conn.sendTime.delete(sendKey);
        reject(new Error(`Timeout waiting for response to ${message.type}`));
      }, timeout);

      this.pendingResponses.set(key, { resolve, reject, timer });

      conn.ws.send(JSON.stringify(message));
      this.stats.msgsSent++;
    });
  }

  /**
   * Get a random open connection.
   */
  random(): WsConnection | undefined {
    const open = this.activeConnections;
    if (open.length === 0) return undefined;
    return open[Math.floor(Math.random() * open.length)];
  }

  /**
   * Get connection by index (wraps).
   */
  at(index: number): WsConnection | undefined {
    const open = this.activeConnections;
    if (open.length === 0) return undefined;
    return open[index % open.length];
  }

  /**
   * Close all connections cleanly with a timeout fallback.
   */
  async shutdown(): Promise<void> {
    for (const interval of this.keepaliveIntervals) {
      clearInterval(interval);
    }
    this.keepaliveIntervals = [];

    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Pool shutting down'));
    }
    this.pendingResponses.clear();

    const closePromises = this.connections.map(
      (conn) =>
        new Promise<void>((resolve) => {
          const forceClose = setTimeout(() => {
            conn.ws.terminate();
            resolve();
          }, 3000);

          if (
            conn.ws.readyState === WebSocket.OPEN ||
            conn.ws.readyState === WebSocket.CONNECTING
          ) {
            conn.ws.on('close', () => {
              clearTimeout(forceClose);
              resolve();
            });
            conn.ws.close(1000, 'load test complete');
          } else {
            clearTimeout(forceClose);
            resolve();
          }
        })
    );

    await Promise.allSettled(closePromises);
    this.connections = [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
