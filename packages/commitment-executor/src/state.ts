/**
 * In-memory store of every live commitment the keeper has observed on
 * the mirror feed. Normalized into runtime-typed (bigint / Address / Hex)
 * objects so downstream code never has to re-parse JSON strings.
 *
 * The state is deliberately ephemeral: if the keeper restarts it loses
 * track of commitments it had seen, and rebuilds the picture from
 * whatever the relayer streams after reconnect. See the README for the
 * implication on missed commitments during downtime.
 */

import { EventEmitter } from 'events';
import type { Address, Hex } from 'viem';
import {
  commitmentFromJson,
  quoteFromJson,
  type Commitment,
  type Quote,
} from '@sapience/sdk/types/committedIntent';
import type {
  CommitmentBroadcast,
  QuoteBroadcast,
  ExecutionBroadcast,
  CommitmentExpiredBroadcast,
  SlashBroadcast,
} from '@sapience/sdk/relayer/committedIntentMessages';
import type { Logger } from './logger';
import { liveCommitments } from './metrics';

export interface SignedQuoteEntry {
  quote: Quote;
  signature: Hex;
  receivedAt: number; // unix ms
}

export interface CommitmentEntry {
  commitmentHash: Hex;
  commitment: Commitment;
  predictorSig: Hex;
  predictorSponsor: Address | null;
  predictorSponsorData: Hex | null;
  chainId: number;
  executorContract: Address;
  createdAt: number; // unix ms
  quotes: Map<Hex, SignedQuoteEntry>;
  /** Number of execute() attempts the keeper has already made. */
  attempts: number;
  /** True once `commitment.executed` or `commitment.expired` lands. */
  settled: boolean;
  /** Last-submitted expire() tx hash (for debouncing the sweeper). */
  expireTxInFlight: boolean;
}

export interface StateOptions {
  logger: Logger;
  /** Grace time after `commitment.deadline` before TTL-evicting. */
  evictGraceMs?: number;
  /** Override for time(). */
  now?: () => number;
}

/**
 * Event names emitted by `CommitmentState`:
 *   - `commitment:new` — commitment observed for the first time.
 *   - `quote:new` — a new quote landed on a tracked commitment.
 *   - `commitment:evicted` — commitment dropped from state (settled, expired or TTL).
 */
export interface StateEvents {
  'commitment:new': (entry: CommitmentEntry) => void;
  'quote:new': (entry: CommitmentEntry, quote: SignedQuoteEntry) => void;
  'commitment:evicted': (hash: Hex, reason: EvictReason) => void;
}

export type EvictReason = 'executed' | 'expired' | 'ttl';

export declare interface CommitmentState {
  on<E extends keyof StateEvents>(event: E, listener: StateEvents[E]): this;
  off<E extends keyof StateEvents>(event: E, listener: StateEvents[E]): this;
  emit<E extends keyof StateEvents>(
    event: E,
    ...args: Parameters<StateEvents[E]>
  ): boolean;
}

export class CommitmentState extends EventEmitter {
  private readonly entries = new Map<Hex, CommitmentEntry>();
  private readonly logger: Logger;
  private readonly evictGraceMs: number;
  private readonly nowFn: () => number;

  constructor(opts: StateOptions) {
    super();
    this.logger = opts.logger;
    this.evictGraceMs = opts.evictGraceMs ?? 60_000;
    this.nowFn = opts.now ?? (() => Date.now());
  }

  size(): number {
    return this.entries.size;
  }

  get(hash: Hex): CommitmentEntry | undefined {
    return this.entries.get(hash);
  }

  entriesArray(): CommitmentEntry[] {
    return Array.from(this.entries.values());
  }

  onCommitmentCreated(broadcast: CommitmentBroadcast): void {
    const hash = broadcast.commitmentHash as Hex;
    if (this.entries.has(hash)) {
      this.logger.debug('duplicate commitment ignored', { hash });
      return;
    }
    const entry: CommitmentEntry = {
      commitmentHash: hash,
      commitment: commitmentFromJson(broadcast.commitment),
      predictorSig: broadcast.signature as Hex,
      predictorSponsor: broadcast.predictorSponsor
        ? (broadcast.predictorSponsor as Address)
        : null,
      predictorSponsorData: broadcast.predictorSponsorData
        ? (broadcast.predictorSponsorData as Hex)
        : null,
      chainId: broadcast.chainId,
      executorContract: broadcast.executorContract as Address,
      createdAt: Date.parse(broadcast.createdAt) || this.nowFn(),
      quotes: new Map(),
      attempts: 0,
      settled: false,
      expireTxInFlight: false,
    };
    this.entries.set(hash, entry);
    liveCommitments.set(this.entries.size);
    this.logger.info('commitment observed', {
      hash,
      predictor: entry.commitment.predictor,
      amountIn: entry.commitment.amountIn,
    });
    this.emit('commitment:new', entry);
  }

  onQuote(broadcast: QuoteBroadcast): void {
    const quote = quoteFromJson(broadcast.quote);
    const hash = quote.commitmentHash as Hex;
    const entry = this.entries.get(hash);
    if (!entry) {
      this.logger.debug('quote for unknown commitment', { hash });
      return;
    }
    const quoteHash = broadcast.quoteHash as Hex;
    if (entry.quotes.has(quoteHash)) return;
    const received = Date.parse(broadcast.receivedAt) || this.nowFn();
    const signed: SignedQuoteEntry = {
      quote,
      signature: broadcast.signature as Hex,
      receivedAt: received,
    };
    entry.quotes.set(quoteHash, signed);
    this.logger.debug('quote observed', {
      hash,
      quoteHash,
      counterparty: quote.counterparty,
    });
    this.emit('quote:new', entry, signed);
  }

  onExecuted(broadcast: ExecutionBroadcast): void {
    const hash = broadcast.commitmentHash as Hex;
    const entry = this.entries.get(hash);
    if (!entry) return;
    // Slash-only-stay-alive: filledIn === 0 means the commitment is
    // still alive and must NOT be evicted.
    const filledIn = BigInt(broadcast.filledIn);
    if (filledIn === 0n) {
      this.logger.info('execute() emitted slash-only outcome; staying alive', {
        hash,
      });
      return;
    }
    entry.settled = true;
    this.evict(hash, 'executed');
  }

  onExpired(_broadcast: CommitmentExpiredBroadcast): void {
    const hash = _broadcast.commitmentHash as Hex;
    const entry = this.entries.get(hash);
    if (!entry) return;
    entry.settled = true;
    this.evict(hash, 'expired');
  }

  onSlashed(_broadcast: SlashBroadcast): void {
    // Slash events don't evict — only update metrics elsewhere.
  }

  /**
   * Evict commitments whose deadline passed more than `evictGraceMs`
   * ago. Meant to be called periodically (e.g. from the expire sweeper
   * tick) so that post-expiry state doesn't accumulate.
   */
  evictExpired(nowMs: number = this.nowFn()): number {
    let n = 0;
    for (const [hash, entry] of this.entries) {
      const deadlineMs = Number(entry.commitment.deadline) * 1000;
      if (nowMs > deadlineMs + this.evictGraceMs && entry.settled) {
        this.evict(hash, 'ttl');
        n++;
      }
    }
    return n;
  }

  private evict(hash: Hex, reason: EvictReason): void {
    if (!this.entries.delete(hash)) return;
    liveCommitments.set(this.entries.size);
    this.logger.info('commitment evicted', { hash, reason });
    this.emit('commitment:evicted', hash, reason);
  }
}
