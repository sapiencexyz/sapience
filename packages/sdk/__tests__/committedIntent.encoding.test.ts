/**
 * Calldata encoder round-trip tests.
 *
 * For each of `commit`, `execute`, `expire` the test encodes a concrete
 * call and decodes it back via `decodeFunctionData` to assert that the
 * hand-rolled ABI is well-formed and matches the struct field ordering.
 */

import { describe, test, expect } from 'vitest';
import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';

import {
  encodeCommitCalldata,
  encodeExecuteCalldata,
  encodeExpireCalldata,
  pickBestPriceFirst,
} from '../auction/committedIntentSigning';
import { committedIntentExecutorAbi } from '../abis/CommittedIntentExecutor';
import { OutcomeSide, type Pick } from '../types/escrow';
import type { Commitment, Quote } from '../types/committedIntent';

const EXEC = getAddress(
  '0x00000000000000000000000000000000000000C1'
) as Address;

const PREDICTOR = getAddress(
  '0x1111111111111111111111111111111111111111'
) as Address;
const CP_A = getAddress(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as Address;
const CP_B = getAddress(
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
) as Address;

const commitment: Commitment = {
  predictor: PREDICTOR,
  predictorWindowEnd: 1800000060n,
  deadline: 1800000120n,
  pickConfigId:
    '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
  amountIn: 100_000000000000000000n,
  minFillIn: 60_000000000000000000n,
  minAmountOut: 150_000000000000000000n,
  executorTip: 1_000000000000000000n,
  nonce: 42n,
};

const picks: Pick[] = [
  {
    conditionResolver: getAddress(
      '0x2222222222222222222222222222222222222222'
    ) as Address,
    conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
    predictedOutcome: OutcomeSide.NO,
  },
];

const DUMMY_SIG = ('0x' + 'de'.repeat(65)) as Hex;

describe('encodeCommitCalldata', () => {
  test('round-trips through decodeFunctionData', () => {
    const data = encodeCommitCalldata(commitment, DUMMY_SIG);
    const decoded = decodeFunctionData({
      abi: committedIntentExecutorAbi,
      data,
    });

    expect(decoded.functionName).toBe('commit');
    const [c, sig] = decoded.args as readonly [typeof commitment, Hex];
    expect(c.predictor.toLowerCase()).toBe(PREDICTOR.toLowerCase());
    expect(c.amountIn).toBe(commitment.amountIn);
    expect(c.nonce).toBe(commitment.nonce);
    expect(sig).toBe(DUMMY_SIG);
  });
});

describe('encodeExpireCalldata', () => {
  test('round-trips through decodeFunctionData', () => {
    const data = encodeExpireCalldata(commitment, DUMMY_SIG);
    const decoded = decodeFunctionData({
      abi: committedIntentExecutorAbi,
      data,
    });

    expect(decoded.functionName).toBe('expire');
    const [c] = decoded.args as readonly [typeof commitment, Hex];
    expect(c.deadline).toBe(commitment.deadline);
  });
});

describe('encodeExecuteCalldata', () => {
  test('round-trips with multiple quotes and picks', () => {
    const quotes: Quote[] = [
      {
        counterparty: CP_A,
        deadline: 1800000100n,
        commitmentHash: ('0x' + 'cc'.repeat(32)) as Hex,
        maxIn: 60_000000000000000000n,
        amountOut: 130_000000000000000000n,
        nonce: 1n,
      },
      {
        counterparty: CP_B,
        deadline: 1800000100n,
        commitmentHash: ('0x' + 'cc'.repeat(32)) as Hex,
        maxIn: 80_000000000000000000n,
        amountOut: 160_000000000000000000n,
        nonce: 2n,
      },
    ];
    const sigs: Hex[] = [DUMMY_SIG, DUMMY_SIG];

    const data = encodeExecuteCalldata({
      c: commitment,
      predictorSig: DUMMY_SIG,
      picks,
      quotes,
      counterpartySigs: sigs,
      tipRecipient: PREDICTOR,
    });

    const decoded = decodeFunctionData({
      abi: committedIntentExecutorAbi,
      data,
    });

    expect(decoded.functionName).toBe('execute');
    const [
      c,
      predictorSig,
      decodedPicks,
      decodedQuotes,
      decodedCpSigs,
      tipRecipient,
    ] = decoded.args as readonly [
      typeof commitment,
      Hex,
      typeof picks,
      typeof quotes,
      Hex[],
      Address,
    ];

    expect(c.predictor.toLowerCase()).toBe(PREDICTOR.toLowerCase());
    expect(predictorSig).toBe(DUMMY_SIG);
    expect(decodedPicks.length).toBe(1);
    expect(decodedPicks[0].conditionId).toBe(picks[0].conditionId);
    expect(decodedQuotes.length).toBe(2);
    expect(decodedQuotes[0].counterparty.toLowerCase()).toBe(
      CP_A.toLowerCase()
    );
    expect(decodedQuotes[1].amountOut).toBe(quotes[1].amountOut);
    expect(decodedCpSigs).toEqual(sigs);
    expect(tipRecipient.toLowerCase()).toBe(PREDICTOR.toLowerCase());
  });
});

describe('pickBestPriceFirst', () => {
  test('sorts descending by implicit price via cross-multiply', () => {
    const worse: Quote = {
      counterparty: CP_A,
      deadline: 1n,
      commitmentHash: '0x00' as Hex,
      maxIn: 100n,
      amountOut: 150n, // price 1.50
      nonce: 1n,
    };
    const better: Quote = {
      counterparty: CP_B,
      deadline: 1n,
      commitmentHash: '0x00' as Hex,
      maxIn: 100n,
      amountOut: 200n, // price 2.00
      nonce: 2n,
    };
    const sorted = pickBestPriceFirst([worse, better]);
    expect(sorted[0]).toBe(better);
    expect(sorted[1]).toBe(worse);
  });

  test('does not mutate input array', () => {
    const quotes: Quote[] = [
      {
        counterparty: CP_A,
        deadline: 1n,
        commitmentHash: '0x00' as Hex,
        maxIn: 100n,
        amountOut: 100n,
        nonce: 1n,
      },
      {
        counterparty: CP_B,
        deadline: 1n,
        commitmentHash: '0x00' as Hex,
        maxIn: 100n,
        amountOut: 200n,
        nonce: 2n,
      },
    ];
    const before = [...quotes];
    pickBestPriceFirst(quotes);
    expect(quotes).toEqual(before);
  });

  test('respects the contract monotonicity check (cross-multiply)', () => {
    // After sorting, for every adjacent pair:
    //   quotes[i-1].amountOut * quotes[i].maxIn >= quotes[i].amountOut * quotes[i-1].maxIn
    const quotes: Quote[] = [
      {
        maxIn: 3n,
        amountOut: 4n,
        counterparty: CP_A,
        deadline: 1n,
        commitmentHash: '0x00' as Hex,
        nonce: 1n,
      },
      {
        maxIn: 5n,
        amountOut: 9n,
        counterparty: CP_B,
        deadline: 1n,
        commitmentHash: '0x00' as Hex,
        nonce: 2n,
      },
      {
        maxIn: 10n,
        amountOut: 30n,
        counterparty: CP_A,
        deadline: 1n,
        commitmentHash: '0x00' as Hex,
        nonce: 3n,
      },
    ];
    const sorted = pickBestPriceFirst(quotes);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      expect(prev.amountOut * curr.maxIn >= curr.amountOut * prev.maxIn).toBe(
        true
      );
    }
  });
});
