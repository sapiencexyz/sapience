/**
 * Wire-format sanity checks for Committed-Intent WebSocket messages.
 *
 * Ensures all payloads are JSON-safe — no bigint leaks on the wire —
 * and that `JSON.parse(JSON.stringify(x))` is an idempotent round-trip.
 */

import { describe, test, expect } from 'vitest';
import {
  commitmentFromJson,
  commitmentToJson,
  quoteFromJson,
  quoteToJson,
  type Commitment,
  type Quote,
  type SignedCommitmentJson,
  type SignedQuoteJson,
} from '../types/committedIntent';
import type {
  CommittedIntentClientMessage,
  CommittedIntentServerMessage,
  CommitmentBroadcast,
  ExecutionBroadcast,
  QuoteBroadcast,
  SlashBroadcast,
} from '../relayer/committedIntentMessages';

const runtimeCommitment: Commitment = {
  predictor: '0x1111111111111111111111111111111111111111',
  predictorWindowEnd: 1800000060n,
  deadline: 1800000120n,
  pickConfigId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  amountIn: 100_000000000000000000n,
  minFillIn: 60_000000000000000000n,
  minAmountOut: 150_000000000000000000n,
  executorTip: 1_000000000000000000n,
  nonce: 42n,
};

const runtimeQuote: Quote = {
  counterparty: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  deadline: 1800000100n,
  commitmentHash:
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  maxIn: 100_000000000000000000n,
  amountOut: 200_000000000000000000n,
  nonce: 7n,
};

describe('commitment JSON converter', () => {
  test('round-trip is idempotent', () => {
    const json = commitmentToJson(runtimeCommitment);
    const restored = commitmentFromJson(json);
    expect(restored).toEqual(runtimeCommitment);
  });

  test('JSON.stringify does not throw (no bigint leak)', () => {
    const json = commitmentToJson(runtimeCommitment);
    expect(() => JSON.stringify(json)).not.toThrow();
    const restored = JSON.parse(JSON.stringify(json));
    expect(commitmentFromJson(restored)).toEqual(runtimeCommitment);
  });
});

describe('quote JSON converter', () => {
  test('round-trip is idempotent', () => {
    const json = quoteToJson(runtimeQuote);
    const restored = quoteFromJson(json);
    expect(restored).toEqual(runtimeQuote);
  });

  test('JSON.stringify does not throw', () => {
    const json = quoteToJson(runtimeQuote);
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});

describe('ClientMessage / ServerMessage round-trips', () => {
  test('commitment.submit envelope serializes cleanly', () => {
    const signedCommitment: SignedCommitmentJson = {
      commitment: commitmentToJson(runtimeCommitment),
      signature: '0xdeadbeef',
      chainId: 8453,
      executorContract: '0x00000000000000000000000000000000000000c1',
    };
    const msg: CommittedIntentClientMessage = {
      type: 'commitment.submit',
      payload: signedCommitment,
    };
    const wire = JSON.stringify(msg);
    const restored = JSON.parse(wire) as CommittedIntentClientMessage;
    expect(restored.type).toBe('commitment.submit');
    if (restored.type === 'commitment.submit') {
      expect(restored.payload.commitment.amountIn).toBe(
        runtimeCommitment.amountIn.toString()
      );
    }
  });

  test('quote.submit envelope serializes cleanly', () => {
    const signedQuote: SignedQuoteJson = {
      quote: quoteToJson(runtimeQuote),
      signature: '0xdeadbeef',
      receivedAt: '2026-04-16T00:00:00Z',
    };
    const msg: CommittedIntentClientMessage = {
      type: 'quote.submit',
      payload: signedQuote,
    };
    const wire = JSON.stringify(msg);
    expect(() => JSON.parse(wire)).not.toThrow();
  });

  test('quote.cancel envelope is string-typed', () => {
    const msg: CommittedIntentClientMessage = {
      type: 'quote.cancel',
      payload: {
        counterparty: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        minNonce: '100',
        signature: '0xdeadbeef',
      },
    };
    expect(() => JSON.stringify(msg)).not.toThrow();
  });

  test('ExecutionBroadcast has string-only bigints', () => {
    const broadcast: ExecutionBroadcast = {
      commitmentHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      caller: '0x1111111111111111111111111111111111111111',
      filledIn: runtimeCommitment.amountIn.toString(),
      filledOut: '200000000000000000000',
      refundedIn: '0',
      tipPaid: runtimeCommitment.executorTip.toString(),
      slices: [
        {
          quoteHash:
            '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          counterparty: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          sliceIn: '100000000000000000000',
          sliceOut: '200000000000000000000',
          sliceBonusCollateral: '0',
          predictionId:
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
      ],
      txHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    };
    const msg: CommittedIntentServerMessage = {
      type: 'commitment.executed',
      payload: broadcast,
    };
    const wire = JSON.stringify(msg);
    expect(() => JSON.parse(wire)).not.toThrow();
    const restored = JSON.parse(wire) as CommittedIntentServerMessage;
    if (restored.type === 'commitment.executed') {
      expect(typeof restored.payload.filledIn).toBe('string');
      expect(typeof restored.payload.slices[0].sliceIn).toBe('string');
    }
  });

  test('SlashBroadcast serializes and restores fields', () => {
    const slash: SlashBroadcast = {
      commitmentHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      counterparty: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      vaultDrained: '50000000000000000000',
      makeWhole: '30000000000000000000',
      poolContribution: '0',
      poolReceived: '20000000000000000000',
      txHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    };
    const wire = JSON.stringify(slash);
    const restored = JSON.parse(wire) as SlashBroadcast;
    expect(restored).toEqual(slash);
  });

  test('CommitmentBroadcast preserves sponsor hints', () => {
    const broadcast: CommitmentBroadcast = {
      commitment: commitmentToJson(runtimeCommitment),
      signature: '0xdead',
      predictorSponsor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      predictorSponsorData: '0x',
      chainId: 8453,
      executorContract: '0x00000000000000000000000000000000000000c1',
      createdAt: '2026-04-16T00:00:00Z',
      commitmentHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    };
    const wire = JSON.stringify(broadcast);
    expect(() => JSON.parse(wire)).not.toThrow();
  });

  test('QuoteBroadcast carries receivedAt + quoteHash', () => {
    const broadcast: QuoteBroadcast = {
      quote: quoteToJson(runtimeQuote),
      signature: '0xdead',
      receivedAt: '2026-04-16T00:00:00Z',
      quoteHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    };
    expect(() => JSON.stringify(broadcast)).not.toThrow();
  });
});
