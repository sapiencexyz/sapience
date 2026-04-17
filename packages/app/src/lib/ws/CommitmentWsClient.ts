'use client';

/**
 * WebSocket client for the committed-intent flow.
 *
 * Analogous to `AuctionWsClient.ts` — connects to the relayer,
 * sends `commitment.submit` / `commitment.subscribe`, and receives
 * `commitment.created`, `commitment.quote`, `commitment.executed`,
 * `commitment.expired`, `commitment.slashed` messages.
 *
 * Uses the existing `ReconnectingWebSocketClient` under the hood.
 */

import type { SignedCommitmentJson } from '@sapience/sdk/types/committedIntent';
import type {
  QuoteBroadcast,
  ExecutionBroadcast,
  SlashBroadcast,
  CommitmentExpiredBroadcast,
  CommitmentAckPayload,
} from '@sapience/sdk/relayer/committedIntentMessages';
import { ReconnectingWebSocketClient } from './ReconnectingWebSocket';

type Unsubscribe = () => void;

/**
 * CommitmentWsClient wraps a `ReconnectingWebSocketClient` with
 * commitment-specific send/subscribe helpers and typed event callbacks.
 */
export class CommitmentWsClient {
  private client: ReconnectingWebSocketClient;
  private quoteListeners = new Set<(q: QuoteBroadcast) => void>();
  private executedListeners = new Set<(e: ExecutionBroadcast) => void>();
  private expiredListeners = new Set<(e: CommitmentExpiredBroadcast) => void>();
  private slashedListeners = new Set<(s: SlashBroadcast) => void>();
  private unsubMessage: (() => void) | null = null;

  constructor(url: string) {
    this.client = new ReconnectingWebSocketClient(url, {
      maxBackoffMs: 30_000,
      initialBackoffMs: 400,
      heartbeatIntervalMs: 25_000,
      staleCloseMs: 60_000,
      debug: !!process.env.NEXT_PUBLIC_DEBUG_WS,
    });

    // Wire up the internal listener that routes messages to typed callbacks
    this.unsubMessage = this.client.addMessageListener((raw: unknown) => {
      const msg = raw as Record<string, unknown>;
      const type = msg.type as string | undefined;
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!type || !payload) return;

      switch (type) {
        case 'commitment.quote':
          for (const cb of this.quoteListeners)
            cb(payload as unknown as QuoteBroadcast);
          break;
        case 'commitment.executed':
          for (const cb of this.executedListeners)
            cb(payload as unknown as ExecutionBroadcast);
          break;
        case 'commitment.expired':
          for (const cb of this.expiredListeners)
            cb(payload as unknown as CommitmentExpiredBroadcast);
          break;
        case 'commitment.slashed':
          for (const cb of this.slashedListeners)
            cb(payload as unknown as SlashBroadcast);
          break;
        default:
          break;
      }
    });
  }

  /**
   * Submit a signed commitment to the relayer.
   * Sends `commitment.submit` and waits for `commitment.ack` response.
   * Returns the `commitmentHash` assigned by the relayer.
   */
  async submitCommitment(
    signed: SignedCommitmentJson
  ): Promise<{ commitmentHash: string }> {
    const ack = await this.client.sendWithAck<CommitmentAckPayload>(
      'commitment.submit',
      signed as unknown as Record<string, unknown>,
      { timeoutMs: 15_000 }
    );
    if (ack.error) {
      throw new Error(`Commitment submit failed: ${ack.error}`);
    }
    if (!ack.commitmentHash) {
      throw new Error('Commitment ack missing commitmentHash');
    }
    return { commitmentHash: ack.commitmentHash };
  }

  /**
   * Subscribe to quote/execution updates for a specific commitment.
   * The relayer starts streaming `commitment.quote`, `commitment.executed`, etc.
   */
  subscribeToCommitment(commitmentHash: string): void {
    this.client.send({
      type: 'commitment.subscribe',
      payload: { commitmentHash },
    } as unknown as Record<string, unknown>);
  }

  /** Unsubscribe from a commitment's quote stream. */
  unsubscribeFromCommitment(commitmentHash: string): void {
    this.client.send({
      type: 'commitment.unsubscribe',
      payload: { commitmentHash },
    } as unknown as Record<string, unknown>);
  }

  /** Register a callback for incoming quotes. */
  onQuote(cb: (quote: QuoteBroadcast) => void): Unsubscribe {
    this.quoteListeners.add(cb);
    return () => this.quoteListeners.delete(cb);
  }

  /** Register a callback for execution broadcasts. */
  onExecuted(cb: (exec: ExecutionBroadcast) => void): Unsubscribe {
    this.executedListeners.add(cb);
    return () => this.executedListeners.delete(cb);
  }

  /** Register a callback for commitment expiry. */
  onExpired(cb: (e: CommitmentExpiredBroadcast) => void): Unsubscribe {
    this.expiredListeners.add(cb);
    return () => this.expiredListeners.delete(cb);
  }

  /** Register a callback for counterparty slash events. */
  onSlashed(cb: (slash: SlashBroadcast) => void): Unsubscribe {
    this.slashedListeners.add(cb);
    return () => this.slashedListeners.delete(cb);
  }

  /** Tear down the WS connection and all listeners. */
  close(): void {
    this.unsubMessage?.();
    this.unsubMessage = null;
    this.quoteListeners.clear();
    this.executedListeners.clear();
    this.expiredListeners.clear();
    this.slashedListeners.clear();
    // The ReconnectingWebSocketClient doesn't expose a destroy, but setting
    // url to null triggers a close.
    this.client.setUrl(null);
  }
}
