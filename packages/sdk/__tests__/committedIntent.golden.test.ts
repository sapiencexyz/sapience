/**
 * Golden-fixture parity test — Committed-Intent EIP-712 hashes.
 *
 * Skips gracefully when the fixture has not yet been produced by Fase 1's
 * Foundry test (`CommittedIntentFixtures.t.sol`). Once the JSON lands,
 * this test enforces that the SDK's TS hash computations match the
 * contract's Solidity output byte-for-byte — catching field-order,
 * typehash, and domain drift.
 */

import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAddress, type Address, type Hex } from 'viem';

import {
  commitmentTypeHash,
  quoteTypeHash,
  computeCommitmentHash,
  computeQuoteHash,
  computeDomainSeparator,
} from '../auction/committedIntentEncoding';
import type { Commitment, Quote } from '../types/committedIntent';

const fixturePath = resolve(
  __dirname,
  '..',
  '__fixtures__',
  'committedIntent.golden.json'
);

interface GoldenFixture {
  chainId: number;
  verifyingContract: string;
  domainSeparator: string;
  commitmentTypehash: string;
  quoteTypehash: string;
  commitment: {
    predictor: string;
    predictorWindowEnd: string;
    deadline: string;
    pickConfigId: string;
    amountIn: string;
    minFillIn: string;
    minAmountOut: string;
    executorTip: string;
    nonce: string;
  };
  commitmentHash: string;
  quote: {
    counterparty: string;
    deadline: string;
    commitmentHash: string;
    maxIn: string;
    amountOut: string;
    nonce: string;
  };
  quoteHash: string;
}

describe('committedIntent golden fixture', () => {
  if (!existsSync(fixturePath)) {
    test.skip('golden fixture absent — produced by Fase 1 Foundry test', () => {});
    return;
  }

  const golden = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixture;

  const exec = getAddress(golden.verifyingContract) as Address;
  const chainId = Number(golden.chainId);

  test('commitmentTypeHash matches', () => {
    expect(commitmentTypeHash().toLowerCase()).toBe(
      golden.commitmentTypehash.toLowerCase()
    );
  });

  test('quoteTypeHash matches', () => {
    expect(quoteTypeHash().toLowerCase()).toBe(
      golden.quoteTypehash.toLowerCase()
    );
  });

  test('DOMAIN_SEPARATOR matches', () => {
    expect(computeDomainSeparator(exec, chainId).toLowerCase()).toBe(
      golden.domainSeparator.toLowerCase()
    );
  });

  test('computeCommitmentHash matches', () => {
    const c: Commitment = {
      predictor: getAddress(golden.commitment.predictor) as Address,
      predictorWindowEnd: BigInt(golden.commitment.predictorWindowEnd),
      deadline: BigInt(golden.commitment.deadline),
      pickConfigId: golden.commitment.pickConfigId as Hex,
      amountIn: BigInt(golden.commitment.amountIn),
      minFillIn: BigInt(golden.commitment.minFillIn),
      minAmountOut: BigInt(golden.commitment.minAmountOut),
      executorTip: BigInt(golden.commitment.executorTip),
      nonce: BigInt(golden.commitment.nonce),
    };

    expect(computeCommitmentHash(c, exec, chainId).toLowerCase()).toBe(
      golden.commitmentHash.toLowerCase()
    );
  });

  test('computeQuoteHash matches', () => {
    const q: Quote = {
      counterparty: getAddress(golden.quote.counterparty) as Address,
      deadline: BigInt(golden.quote.deadline),
      commitmentHash: golden.quote.commitmentHash as Hex,
      maxIn: BigInt(golden.quote.maxIn),
      amountOut: BigInt(golden.quote.amountOut),
      nonce: BigInt(golden.quote.nonce),
    };

    expect(computeQuoteHash(q, exec, chainId).toLowerCase()).toBe(
      golden.quoteHash.toLowerCase()
    );
  });
});
