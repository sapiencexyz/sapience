import { describe, it, expect, beforeEach } from 'vitest';
import type { Address, Hex } from 'viem';
import type {
  CommitmentBroadcast,
  QuoteBroadcast,
  ExecutionBroadcast,
  CommitmentExpiredBroadcast,
} from '@sapience/sdk/relayer/committedIntentMessages';
import { CommitmentState } from '../state';
import { createLogger } from '../logger';

const logger = createLogger('error');

function makeCommitmentBroadcast(over: Partial<CommitmentBroadcast> = {}): CommitmentBroadcast {
  return {
    commitmentHash: ('0x' + 'ab'.repeat(32)) as Hex,
    commitment: {
      predictor: '0x0000000000000000000000000000000000000001' as Address,
      predictorWindowEnd: '100',
      deadline: '200',
      pickConfigId: ('0x' + '22'.repeat(32)) as Hex,
      amountIn: '100',
      minFillIn: '60',
      minAmountOut: '150',
      executorTip: '1',
      nonce: '0',
    },
    signature: '0xdeadbeef',
    chainId: 8453,
    executorContract: '0x00000000000000000000000000000000000000C1',
    createdAt: new Date(0).toISOString(),
    ...over,
  };
}

function makeQuoteBroadcast(commitmentHash: string, over: Partial<QuoteBroadcast> = {}): QuoteBroadcast {
  return {
    quote: {
      counterparty: '0x0000000000000000000000000000000000000002' as Address,
      deadline: '190',
      commitmentHash,
      maxIn: '100',
      amountOut: '200',
      nonce: '0',
    },
    signature: '0xabcd',
    receivedAt: new Date(0).toISOString(),
    quoteHash: ('0x' + 'cd'.repeat(32)) as Hex,
    ...over,
  };
}

describe('CommitmentState', () => {
  let state: CommitmentState;

  beforeEach(() => {
    state = new CommitmentState({ logger, evictGraceMs: 0, now: () => 0 });
  });

  it('ingests commitment.created and exposes the entry', () => {
    const b = makeCommitmentBroadcast();
    state.onCommitmentCreated(b);
    expect(state.size()).toBe(1);
    const entry = state.get(b.commitmentHash as Hex)!;
    expect(entry.commitment.amountIn).toBe(100n);
    expect(entry.quotes.size).toBe(0);
  });

  it('drops duplicate commitment.created for the same hash', () => {
    const b = makeCommitmentBroadcast();
    state.onCommitmentCreated(b);
    state.onCommitmentCreated(b);
    expect(state.size()).toBe(1);
  });

  it('attaches quotes to the right commitment and ignores unknown ones', () => {
    const c = makeCommitmentBroadcast();
    state.onCommitmentCreated(c);
    state.onQuote(makeQuoteBroadcast(c.commitmentHash));
    state.onQuote(makeQuoteBroadcast('0x' + '00'.repeat(32))); // unknown
    const entry = state.get(c.commitmentHash as Hex)!;
    expect(entry.quotes.size).toBe(1);
  });

  it('evicts on commitment.executed with a non-zero fill', () => {
    const c = makeCommitmentBroadcast();
    state.onCommitmentCreated(c);
    const execBroadcast: ExecutionBroadcast = {
      commitmentHash: c.commitmentHash,
      caller: '0x0000000000000000000000000000000000000009',
      filledIn: '100',
      filledOut: '200',
      refundedIn: '0',
      tipPaid: '1',
      slices: [],
      txHash: '0x',
    };
    state.onExecuted(execBroadcast);
    expect(state.size()).toBe(0);
  });

  it('does NOT evict on commitment.executed with filledIn==0 (slash-only stay-alive)', () => {
    const c = makeCommitmentBroadcast();
    state.onCommitmentCreated(c);
    state.onExecuted({
      commitmentHash: c.commitmentHash,
      caller: '0x0',
      filledIn: '0',
      filledOut: '0',
      refundedIn: '0',
      tipPaid: '0',
      slices: [],
      txHash: '0x',
    });
    expect(state.size()).toBe(1);
  });

  it('evicts on commitment.expired', () => {
    const c = makeCommitmentBroadcast();
    state.onCommitmentCreated(c);
    const expired: CommitmentExpiredBroadcast = {
      commitmentHash: c.commitmentHash,
      txHash: '0x',
    };
    state.onExpired(expired);
    expect(state.size()).toBe(0);
  });

  it('TTL-evicts commitments whose deadline passed + grace AND which were marked settled', () => {
    const s = new CommitmentState({ logger, evictGraceMs: 60_000, now: () => 300_000 });
    const c = makeCommitmentBroadcast();
    s.onCommitmentCreated(c);
    const entry = s.get(c.commitmentHash as Hex)!;
    entry.settled = true; // simulate we saw a settled signal we didn't evict on
    const evicted = s.evictExpired(300_000);
    expect(evicted).toBe(1);
    expect(s.size()).toBe(0);
  });

  it('TTL does not evict unsettled commitments (the expire sweeper handles those)', () => {
    const s = new CommitmentState({ logger, evictGraceMs: 0, now: () => 999_999_000 });
    const c = makeCommitmentBroadcast();
    s.onCommitmentCreated(c);
    s.evictExpired(999_999_000);
    expect(s.size()).toBe(1);
  });

  it('emits typed events', () => {
    const events: string[] = [];
    state.on('commitment:new', () => events.push('new'));
    state.on('quote:new', () => events.push('quote'));
    state.on('commitment:evicted', (_h, r) => events.push(`evicted:${r}`));
    const c = makeCommitmentBroadcast();
    state.onCommitmentCreated(c);
    state.onQuote(makeQuoteBroadcast(c.commitmentHash));
    state.onExecuted({
      commitmentHash: c.commitmentHash,
      caller: '0x0',
      filledIn: '100',
      filledOut: '200',
      refundedIn: '0',
      tipPaid: '0',
      slices: [],
      txHash: '0x',
    });
    expect(events).toEqual(['new', 'quote', 'evicted:executed']);
  });
});
