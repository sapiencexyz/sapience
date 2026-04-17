/**
 * Committed Intent Registry
 *
 * In-memory store of live commitments plus the signed quotes that arrived
 * for each one. Mirrors the spirit of `escrowRegistry.ts`, adapted to the
 * Committed-Intent flow (PRD-001).
 *
 * Each record is keyed by `commitmentHash` and expires automatically at
 * `commitment.deadline + COMMITTED_INTENT_GRACE_SECONDS`. The periodic
 * sweep runs every 10s; lookup also does a lazy expiry check.
 *
 * Pure storage — signature verification, quality gates, exposure tracking,
 * and broadcast all live in their respective helpers and in the handler.
 */

import type {
  Commitment,
  SignedCommitmentJson,
  SignedQuoteJson,
} from '@sapience/sdk/types/committedIntent';
import { commitmentFromJson } from '@sapience/sdk/types/committedIntent';
import { config } from './config';

export interface CommitmentRecord {
  /** Decoded runtime commitment (bigints, branded hex). */
  commitment: Commitment;
  /** Signed envelope as received on the wire. */
  signed: SignedCommitmentJson;
  /** Canonical commitmentHash (hex) — also the map key. */
  commitmentHash: string;
  /** Wall-clock ms when the relayer accepted the commitment. */
  createdAtMs: number;
  /** ISO string mirror of `createdAtMs`, stable across restarts for broadcast. */
  createdAt: string;
  /** Absolute epoch ms after which this record is eligible for pruning. */
  expiresAtMs: number;
  /** Signed quote envelopes indexed-in-order (receivedAt populated by relayer). */
  quotes: SignedQuoteJson[];
  /** Flipped true when the commitment settled on-chain (mint or slash-only). */
  settled: boolean;
}

const commitments = new Map<string, CommitmentRecord>();

/**
 * Per-counterparty monotonic minimum nonce. Quotes with `nonce < minNonce`
 * are considered invalidated (§4.5.5b).
 */
const minAcceptedNonce = new Map<string, bigint>();

function graceMs(): number {
  return config.COMMITTED_INTENT_GRACE_SECONDS * 1000;
}

function expiryFromCommitment(c: Commitment): number {
  return Number(c.deadline) * 1000 + graceMs();
}

/** Insert or replace a commitment record. Returns the stored record. */
export function upsertCommitment(
  signed: SignedCommitmentJson,
  commitmentHash: string
): CommitmentRecord {
  const commitment = commitmentFromJson(signed.commitment);
  const now = Date.now();
  const record: CommitmentRecord = {
    commitment,
    signed,
    commitmentHash,
    createdAtMs: now,
    createdAt: new Date(now).toISOString(),
    expiresAtMs: expiryFromCommitment(commitment),
    quotes: [],
    settled: false,
  };
  commitments.set(commitmentHash, record);
  return record;
}

/**
 * Get a commitment by hash. Lazily prunes the record if it has expired past
 * the grace window.
 */
export function getCommitment(
  commitmentHash: string
): CommitmentRecord | undefined {
  const rec = commitments.get(commitmentHash);
  if (!rec) return undefined;
  if (Date.now() > rec.expiresAtMs) {
    commitments.delete(commitmentHash);
    return undefined;
  }
  return rec;
}

/** Append a signed quote to a live commitment. Returns the record or undefined. */
export function addQuote(
  commitmentHash: string,
  signed: SignedQuoteJson
): CommitmentRecord | undefined {
  const rec = getCommitment(commitmentHash);
  if (!rec) return undefined;
  // De-dupe by signature (defensive — the handler also rejects duplicates).
  if (
    signed.signature &&
    rec.quotes.some((q) => q.signature === signed.signature)
  ) {
    return undefined;
  }
  rec.quotes.push(signed);
  return rec;
}

/** Return a snapshot array of signed quotes currently known for a commitment. */
export function getQuotes(commitmentHash: string): SignedQuoteJson[] {
  const rec = getCommitment(commitmentHash);
  return rec ? [...rec.quotes] : [];
}

/** Snapshot of every live (unexpired) commitment record. */
export function getAllCommitments(): CommitmentRecord[] {
  const now = Date.now();
  const out: CommitmentRecord[] = [];
  for (const [hash, rec] of commitments.entries()) {
    if (now > rec.expiresAtMs) {
      commitments.delete(hash);
      continue;
    }
    out.push(rec);
  }
  return out;
}

/** Mark a commitment as settled (mint happened or slash-only). */
export function markSettled(commitmentHash: string): boolean {
  const rec = commitments.get(commitmentHash);
  if (!rec) return false;
  rec.settled = true;
  return true;
}

/**
 * Bump the `minAcceptedNonce` for a counterparty (§4.5.5b).
 * Returns the set of commitmentHashes whose quote list changed.
 */
export function invalidateQuotesByNonce(
  counterparty: string,
  minNonce: bigint
): { affected: string[]; removed: number } {
  const cp = counterparty.toLowerCase();
  const prev = minAcceptedNonce.get(cp) ?? 0n;
  if (minNonce <= prev) {
    return { affected: [], removed: 0 };
  }
  minAcceptedNonce.set(cp, minNonce);

  const affected: string[] = [];
  let removed = 0;
  for (const rec of commitments.values()) {
    const before = rec.quotes.length;
    rec.quotes = rec.quotes.filter((q) => {
      if (q.quote.counterparty.toLowerCase() !== cp) return true;
      const n = BigInt(q.quote.nonce);
      return n >= minNonce;
    });
    const diff = before - rec.quotes.length;
    if (diff > 0) {
      affected.push(rec.commitmentHash);
      removed += diff;
    }
  }
  return { affected, removed };
}

/** Read the current min-nonce floor for a counterparty (0 if never set). */
export function getMinAcceptedNonce(counterparty: string): bigint {
  return minAcceptedNonce.get(counterparty.toLowerCase()) ?? 0n;
}

/**
 * Remove records whose grace-period has elapsed. Returns the commitmentHashes
 * that were pruned. Called by the periodic sweep and safe to call manually.
 */
export function pruneExpired(): string[] {
  const now = Date.now();
  const pruned: string[] = [];
  for (const [hash, rec] of commitments.entries()) {
    if (now > rec.expiresAtMs) {
      commitments.delete(hash);
      pruned.push(hash);
    }
  }
  return pruned;
}

/** Test-only helper: wipe all in-memory state. */
export function _clearCommittedIntentRegistryForTesting(): void {
  commitments.clear();
  minAcceptedNonce.clear();
}

// Periodic sweep every 10s. `.unref()` so the timer never keeps the process alive.
const sweepInterval = setInterval(() => {
  pruneExpired();
}, 10_000);
sweepInterval.unref?.();
