import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Address } from 'viem';
import type {
  CardSubmission,
  LineProgress,
  PoolRecord,
  SerializedSession,
} from './types.js';

type JournalRecord =
  | { type: 'session'; at: number; session: SerializedSession }
  | { type: 'submit'; at: number; submission: CardSubmission }
  | { type: 'pool'; at: number; record: PoolRecord }
  | {
      type: 'line';
      at: number;
      player: Address;
      poolId: string;
      lineId: string;
    }
  | {
      type: 'payout';
      at: number;
      player: Address;
      poolId: string;
      kind: 'bonus' | 'referral';
      amountWei: string;
      to: Address;
      txHash?: string;
    };

function cardKey(player: Address, poolId: string): string {
  return `${player.toLowerCase()}:${poolId}`;
}

/**
 * In-memory state + append-only JSONL journal, replayed on boot. Everything
 * not journaled here (line funded, wins) is derived from chain state. See
 * DESIGN.md — Postgres is the v2 home; this module is the only seam.
 */
export class Store {
  private readonly journalPath: string;
  private readonly sessions = new Map<string, SerializedSession>();
  private readonly submissions = new Map<string, CardSubmission>();
  private readonly payouts: Extract<JournalRecord, { type: 'payout' }>[] = [];
  /** Lines that minted successfully, ever. Monotonic — survives the player
   *  redeeming (burning) the position tokens, which a live balance check
   *  does not (a redeemed winning line must still count as funded for
   *  entitlements). */
  private readonly fundedLines = new Map<string, Set<string>>();
  /** Pool registry (insertion-ordered; the last one created is active).
   *  Holds each pool's fairness secret — journal stays 0600. */
  private readonly pools = new Map<string, PoolRecord>();
  /** Live per-line progress for in-flight submissions. Memory-only. */
  private readonly progress = new Map<string, LineProgress[]>();

  constructor(dataDir: string) {
    // The journal holds session private keys — owner-only access.
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.journalPath = join(dataDir, 'journal.jsonl');
    this.replay();
  }

  private replay(): void {
    if (!existsSync(this.journalPath)) return;
    const lines = readFileSync(this.journalPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as JournalRecord;
      if (rec.type === 'session') {
        this.sessions.set(
          rec.session.config.smartAccountAddress.toLowerCase(),
          rec.session,
        );
      } else if (rec.type === 'submit') {
        this.submissions.set(
          cardKey(rec.submission.player, rec.submission.poolId),
          rec.submission,
        );
      } else if (rec.type === 'line') {
        const key = cardKey(rec.player, rec.poolId);
        if (!this.fundedLines.has(key)) this.fundedLines.set(key, new Set());
        this.fundedLines.get(key)!.add(rec.lineId);
      } else if (rec.type === 'pool') {
        this.pools.set(rec.record.pool.poolId, rec.record);
      } else {
        this.payouts.push(rec);
      }
    }
  }

  private append(rec: JournalRecord): void {
    appendFileSync(this.journalPath, JSON.stringify(rec) + '\n', {
      mode: 0o600,
    });
  }

  // ---- sessions ----

  putSession(session: SerializedSession): void {
    this.sessions.set(
      session.config.smartAccountAddress.toLowerCase(),
      session,
    );
    this.append({ type: 'session', at: Date.now(), session });
  }

  getSession(player: Address): SerializedSession | undefined {
    const s = this.sessions.get(player.toLowerCase());
    if (!s) return undefined;
    if (Date.now() > s.config.expiresAt) return undefined;
    return s;
  }

  // ---- submissions ----

  putSubmission(submission: CardSubmission): void {
    this.submissions.set(
      cardKey(submission.player, submission.poolId),
      submission,
    );
    this.append({ type: 'submit', at: Date.now(), submission });
  }

  getSubmission(player: Address, poolId: string): CardSubmission | undefined {
    return this.submissions.get(cardKey(player, poolId));
  }

  allSubmissions(): CardSubmission[] {
    return [...this.submissions.values()];
  }

  // ---- pools ----

  /** Registers a pool (journaled). The most recently added pool is active. */
  putPool(record: PoolRecord): void {
    if (this.pools.has(record.pool.poolId)) {
      throw new Error(`pool ${record.pool.poolId} already exists`);
    }
    this.pools.set(record.pool.poolId, record);
    this.append({ type: 'pool', at: Date.now(), record });
  }

  /** Seeds the bootstrap pool from config without journaling (it lives in
   *  pool.json + SERVER_SECRET env). No-op if the id is already journaled. */
  seedPool(record: PoolRecord): void {
    if (this.pools.has(record.pool.poolId)) return;
    // Re-insert so journaled pools created later still rank as newer.
    const entries = [...this.pools.entries()];
    this.pools.clear();
    this.pools.set(record.pool.poolId, record);
    for (const [k, v] of entries) this.pools.set(k, v);
  }

  getPool(poolId: string): PoolRecord | undefined {
    return this.pools.get(poolId);
  }

  /** The most recently registered pool. */
  activePool(): PoolRecord | undefined {
    let last: PoolRecord | undefined;
    for (const v of this.pools.values()) last = v;
    return last;
  }

  allPools(): PoolRecord[] {
    return [...this.pools.values()];
  }

  // ---- funded lines (monotonic) ----

  markLineFunded(player: Address, poolId: string, lineId: string): void {
    const key = cardKey(player, poolId);
    if (!this.fundedLines.has(key)) this.fundedLines.set(key, new Set());
    const set = this.fundedLines.get(key)!;
    if (set.has(lineId)) return;
    set.add(lineId);
    this.append({ type: 'line', at: Date.now(), player, poolId, lineId });
  }

  fundedLineIds(player: Address, poolId: string): ReadonlySet<string> {
    return this.fundedLines.get(cardKey(player, poolId)) ?? new Set();
  }

  // ---- live progress ----

  setProgress(player: Address, poolId: string, lines: LineProgress[]): void {
    this.progress.set(cardKey(player, poolId), lines);
  }

  updateProgress(
    player: Address,
    poolId: string,
    lineId: string,
    patch: Partial<LineProgress>,
  ): void {
    const key = cardKey(player, poolId);
    const lines = this.progress.get(key);
    if (!lines) return;
    const idx = lines.findIndex((l) => l.lineId === lineId);
    if (idx >= 0) lines[idx] = { ...lines[idx], ...patch };
  }

  getProgress(player: Address, poolId: string): LineProgress[] | undefined {
    return this.progress.get(cardKey(player, poolId));
  }

  // ---- payouts ----

  markPayout(rec: Omit<Extract<JournalRecord, { type: 'payout' }>, 'type' | 'at'>): void {
    const full = { type: 'payout' as const, at: Date.now(), ...rec };
    this.payouts.push(full);
    this.append(full);
  }

  payoutsFor(player: Address, poolId: string) {
    return this.payouts.filter(
      (p) =>
        p.player.toLowerCase() === player.toLowerCase() && p.poolId === poolId,
    );
  }
}
