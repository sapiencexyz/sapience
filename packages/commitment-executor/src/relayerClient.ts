/**
 * Minimal WebSocket client for the relayer's committed-intent mirror
 * feed. Subscribes to `mirror:all` and re-emits each parsed
 * `CommittedIntentServerMessage` as a typed Node EventEmitter event.
 *
 * Handles reconnection with capped exponential backoff; consumers do
 * not need to care about the underlying socket lifecycle.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  CommittedIntentServerMessage,
  CommitmentBroadcast,
  QuoteBroadcast,
  ExecutionBroadcast,
  CommitmentExpiredBroadcast,
  SlashBroadcast,
} from '@sapience/sdk/relayer/committedIntentMessages';
import type { Logger } from './logger';

export interface RelayerClientOptions {
  url: string;
  logger: Logger;
  /** Topic to subscribe to on connect. Defaults to 'mirror:all'. */
  topic?: string;
  /** Backoff config (override for tests). */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** WS constructor — override for tests. */
  wsFactory?: (url: string) => WebSocket;
}

/**
 * Events surfaced by the relayer client. Payloads are exactly the
 * `payload` fields from the corresponding `CommittedIntentServerMessage`
 * variants. A catch-all `message` event is also emitted.
 */
export interface RelayerClientEvents {
  open: () => void;
  close: (code: number, reason: string) => void;
  error: (err: Error) => void;
  message: (msg: CommittedIntentServerMessage) => void;
  'commitment.created': (payload: CommitmentBroadcast) => void;
  'commitment.quote': (payload: QuoteBroadcast) => void;
  'commitment.executed': (payload: ExecutionBroadcast) => void;
  'commitment.expired': (payload: CommitmentExpiredBroadcast) => void;
  'commitment.slashed': (payload: SlashBroadcast) => void;
}

export declare interface RelayerClient {
  on<E extends keyof RelayerClientEvents>(
    event: E,
    listener: RelayerClientEvents[E]
  ): this;
  once<E extends keyof RelayerClientEvents>(
    event: E,
    listener: RelayerClientEvents[E]
  ): this;
  off<E extends keyof RelayerClientEvents>(
    event: E,
    listener: RelayerClientEvents[E]
  ): this;
  emit<E extends keyof RelayerClientEvents>(
    event: E,
    ...args: Parameters<RelayerClientEvents[E]>
  ): boolean;
}

export class RelayerClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly url: string;
  private readonly topic: string;
  private readonly logger: Logger;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly wsFactory: (url: string) => WebSocket;

  constructor(opts: RelayerClientOptions) {
    super();
    this.url = opts.url;
    this.topic = opts.topic ?? 'mirror:all';
    this.logger = opts.logger;
    this.minBackoffMs = opts.minBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.wsFactory = opts.wsFactory ?? ((u) => new WebSocket(u));
  }

  start(): void {
    if (this.closed) return;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'client_shutdown');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a raw JSON message. Surface intentionally tiny — the keeper
   * only ever needs to send the initial subscribe message.
   */
  send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('skipping send: ws not open');
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private connect(): void {
    this.logger.info('relayer ws connecting', { url: this.url });
    const ws = this.wsFactory(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.logger.info('relayer ws connected');
      try {
        ws.send(
          JSON.stringify({ type: 'subscribe', payload: { topic: this.topic } })
        );
      } catch (err) {
        this.logger.error('failed to send subscribe', {
          err: (err as Error).message,
        });
      }
      this.emit('open');
    });

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        this.logger.warn('relayer ws: malformed JSON message');
        return;
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { type?: unknown }).type !== 'string'
      ) {
        return;
      }
      const msg = parsed as CommittedIntentServerMessage;
      this.emit('message', msg);
      switch (msg.type) {
        case 'commitment.created':
          this.emit('commitment.created', msg.payload);
          break;
        case 'commitment.quote':
          this.emit('commitment.quote', msg.payload);
          break;
        case 'commitment.executed':
          this.emit('commitment.executed', msg.payload);
          break;
        case 'commitment.expired':
          this.emit('commitment.expired', msg.payload);
          break;
        case 'commitment.slashed':
          this.emit('commitment.slashed', msg.payload);
          break;
        default:
          // ack messages and unknown types intentionally ignored
          break;
      }
    });

    ws.on('error', (err) => {
      this.logger.warn('relayer ws error', { err: err.message });
      this.emit('error', err);
    });

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf.toString();
      this.logger.warn('relayer ws closed', { code, reason });
      this.ws = null;
      this.emit('close', code, reason);
      if (!this.closed) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const backoff = Math.min(
      this.maxBackoffMs,
      this.minBackoffMs * 2 ** (this.reconnectAttempts - 1)
    );
    this.logger.info('relayer ws reconnecting', {
      attempt: this.reconnectAttempts,
      backoffMs: backoff,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, backoff);
  }
}
