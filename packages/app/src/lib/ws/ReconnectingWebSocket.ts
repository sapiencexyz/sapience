'use client';

import * as Sentry from '@sentry/nextjs';

type OutgoingMessage = Record<string, unknown> & { id?: string };

type AckResolver = {
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: number;
};

interface ReconnectingWebSocketOptions {
  maxBackoffMs?: number; // default 30s
  initialBackoffMs?: number; // default 400ms
  heartbeatIntervalMs?: number; // default 25s
  staleCloseMs?: number; // default 60s
  debug?: boolean;
}

export class ReconnectingWebSocketClient {
  private url: string | null = null;
  private ws: WebSocket | null = null;
  private isOpen = false;
  private backoffMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly staleCloseMs: number;
  private heartbeatTimer: number | null = null;
  private lastPongAt: number = Date.now();
  private outbox: string[] = [];
  private acks = new Map<string, AckResolver>();
  private debug = false;
  private messageListeners = new Set<(msg: unknown) => void>();
  private openListeners = new Set<() => void>();
  private closeListeners = new Set<() => void>();
  private errorListeners = new Set<(e: unknown) => void>();
  private reconnectListeners = new Set<() => void>();

  constructor(url: string | null, opts?: ReconnectingWebSocketOptions) {
    this.url = url || null;
    this.initialBackoffMs = opts?.initialBackoffMs ?? 400;
    this.maxBackoffMs = opts?.maxBackoffMs ?? 30_000;
    this.backoffMs = this.initialBackoffMs;
    this.heartbeatIntervalMs = opts?.heartbeatIntervalMs ?? 25_000;
    this.staleCloseMs = opts?.staleCloseMs ?? 60_000;
    this.debug = !!opts?.debug || !!process.env.NEXT_PUBLIC_DEBUG_WS;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.tryReconnectSoon());
      window.addEventListener('offline', () => this.safeClose());
    }

    if (this.url) this.connect();
  }

  setUrl(url: string | null) {
    const next = url || null;
    if (this.url === next) return;
    this.url = next;
    this.tryReconnectSoon(true);
  }

  private log(...args: unknown[]) {
    if (this.debug) console.debug('[WS]', ...args);
  }

  addMessageListener(cb: (msg: unknown) => void) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  addOpenListener(cb: () => void) {
    this.openListeners.add(cb);
    return () => this.openListeners.delete(cb);
  }

  addCloseListener(cb: () => void) {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  addErrorListener(cb: (e: unknown) => void) {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  addReconnectListener(cb: () => void) {
    this.reconnectListeners.add(cb);
    return () => this.reconnectListeners.delete(cb);
  }

  private connect() {
    if (!this.url) return;
    try {
      this.log('connecting', this.url);
      Sentry.addBreadcrumb({
        category: 'ws.lifecycle',
        level: 'info',
        message: 'connect',
        data: { url: this.url },
      });
      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.isOpen = false;

      ws.onopen = () => {
        this.log('open');
        Sentry.addBreadcrumb({
          category: 'ws.lifecycle',
          level: 'info',
          message: 'open',
        });
        this.isOpen = true;
        this.backoffMs = this.initialBackoffMs;
        this.flushOutbox();
        this.startHeartbeat();
        for (const cb of Array.from(this.openListeners)) {
          try {
            cb();
          } catch {
            /* no-op */
          }
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.type === 'pong') {
            this.lastPongAt = Date.now();
            return;
          }
          const id = String(msg?.id || msg?.payload?.id || '');
          if (id && this.acks.has(id)) {
            const { resolve, reject, timeout } = this.acks.get(id)!;
            window.clearTimeout(timeout);
            this.acks.delete(id);
            if (msg?.payload?.error)
              reject(new Error(String(msg.payload.error)));
            else resolve(msg?.payload ?? msg);
          }
          for (const cb of Array.from(this.messageListeners)) {
            try {
              cb(msg);
            } catch (e) {
              this.log('listener error', e);
            }
          }
        } catch (e) {
          this.log('onmessage error', e);
        }
      };

      ws.onerror = (e) => {
        this.log('error', e);
        Sentry.addBreadcrumb({
          category: 'ws.lifecycle',
          level: 'error',
          message: 'error',
        });
        for (const cb of Array.from(this.errorListeners)) {
          try {
            cb(e);
          } catch {
            /* no-op */
          }
        }
      };

      ws.onclose = () => {
        this.log('close');
        Sentry.addBreadcrumb({
          category: 'ws.lifecycle',
          level: 'info',
          message: 'close',
        });
        this.isOpen = false;
        this.stopHeartbeat();
        for (const cb of Array.from(this.closeListeners)) {
          try {
            cb();
          } catch {
            /* no-op */
          }
        }
        this.scheduleReconnect();
      };
    } catch (e) {
      this.log('connect throw', e);
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    this.heartbeatTimer = window.setInterval(() => {
      try {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const now = Date.now();
        if (now - this.lastPongAt > this.staleCloseMs) {
          this.log('stale pong; closing');
          this.safeClose();
          return;
        }
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        this.log('heartbeat error', e);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (!this.url) return;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(this.backoffMs + jitter, this.maxBackoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    window.setTimeout(() => {
      if (navigator.onLine === false) return;
      Sentry.addBreadcrumb({
        category: 'ws.lifecycle',
        level: 'info',
        message: 'reconnect',
        data: { delay },
      });
      for (const cb of Array.from(this.reconnectListeners)) {
        try {
          cb();
        } catch {
          /* no-op */
        }
      }
      this.connect();
    }, delay);
  }

  private tryReconnectSoon(force = false) {
    if (!this.url) return;
    if (force) this.backoffMs = this.initialBackoffMs;
    Sentry.addBreadcrumb({
      category: 'ws.lifecycle',
      level: 'info',
      message: 'reconnect-soon',
      data: { force },
    });
    this.safeClose();
  }

  private safeClose() {
    try {
      if (this.ws) this.ws.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.isOpen = false;
    this.stopHeartbeat();
  }

  private flushOutbox() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queue = this.outbox.splice(0, this.outbox.length);
    for (const raw of queue) {
      try {
        this.ws.send(raw);
      } catch (e) {
        this.log('send error (flush)', e);
      }
    }
  }

  /** Resolves when the socket is open, or rejects after timeoutMs. */
  private waitForOpen(timeoutMs: number): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('ws_not_connected'));
      }, timeoutMs);
      const cleanup = this.addOpenListener(() => {
        window.clearTimeout(timer);
        cleanup();
        resolve();
      });
    });
  }

  send(msg: OutgoingMessage) {
    const payload = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return;
      } catch (e) {
        this.log('send error', e);
      }
    }
    this.outbox.push(payload);
  }

  async sendWithAck<T = unknown>(
    type: string,
    payload: Record<string, unknown>,
    opts?: { timeoutMs?: number }
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? 5_000;
    // Wait for connection before sending — the ack timer only starts once
    // the message is actually on the wire, so callers get a meaningful timeout.
    await this.waitForOpen(timeoutMs);
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Math.random()).slice(2) + String(Date.now());
    return await new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.acks.has(id)) this.acks.delete(id);
        Sentry.addBreadcrumb({
          category: 'ws.lifecycle',
          level: 'warning',
          message: 'ack-timeout',
          data: { id, type },
        });
        reject(new Error('ack_timeout'));
      }, timeoutMs);
      this.acks.set(id, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timeout,
      });
      this.send({ id, type, payload: { ...payload, id } });
    });
  }
}
