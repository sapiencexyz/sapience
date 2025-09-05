import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma';
import {
  normalizePredictionToProbability,
  outcomeFromSettlement,
} from './predictionNormalization';

describe('normalizePredictionToProbability', () => {
  it('parses yes/no', () => {
    const yes = normalizePredictionToProbability('yes', null);
    const no = normalizePredictionToProbability('no', null);
    expect(yes.probabilityFloat).toBe(1);
    expect(no.probabilityFloat).toBe(0);
  });

  it('parses boolean-like 0/1', () => {
    expect(normalizePredictionToProbability('1', null).probabilityFloat).toBe(
      1
    );
    expect(normalizePredictionToProbability('0', null).probabilityFloat).toBe(
      0
    );
  });

  it('parses decimals [0,1]', () => {
    const res = normalizePredictionToProbability('0.73', null);
    expect(res.probabilityFloat).toBeCloseTo(0.73, 6);
  });

  it('rejects out-of-range decimals', () => {
    const over = normalizePredictionToProbability('1.2', null);
    const under = normalizePredictionToProbability('-0.1', null);
    expect(over.probabilityFloat).toBeNull();
    expect(under.probabilityFloat).toBeNull();
  });

  it('parses D18 string', () => {
    const res = normalizePredictionToProbability('730000000000000000', null);
    expect(res.probabilityFloat).toBeCloseTo(0.73, 6);
  });

  it('handles high D18 probabilities close to 1', () => {
    const nearOne = normalizePredictionToProbability(
      '999999999999999999',
      null
    );
    expect(nearOne.probabilityFloat).toBeLessThanOrEqual(1);
    expect(nearOne.probabilityFloat!).toBeGreaterThan(0.9);
  });

  it('parses sqrtPriceX96 using market bounds', () => {
    // sqrtPriceX96=0 -> priceD18=0 => p=0
    const market = {
      minPriceD18: new Prisma.Decimal(0),
      maxPriceD18: new Prisma.Decimal('1000000000000000000'),
    };
    const res0 = normalizePredictionToProbability('0', market);
    expect(res0.probabilityFloat).toBe(0);
  });

  it('treats large integers as sqrtPriceX96 when market provided, not D18', () => {
    const market = {
      minPriceD18: new Prisma.Decimal(0),
      maxPriceD18: new Prisma.Decimal('1000000000000000000'),
    };
    // Use a realistic sqrtPriceX96 that maps to mid-range price within bounds.
    // Let sqrtPrice be 1e9 (arbitrary). Then sqrtPriceX96 = 1e9 * 2^96
    const Q96 = 1n << 96n;
    const sqrtPrice = 1_000_000_000n; // 1e9
    const sqrtPriceX96 = (sqrtPrice * Q96).toString();
    const res = normalizePredictionToProbability(sqrtPriceX96, market);
    expect(res.probabilityFloat).not.toBeNull();
    expect(res.probabilityFloat).toBeGreaterThanOrEqual(0);
    expect(res.probabilityFloat).toBeLessThanOrEqual(1);
  });
});

describe('outcomeFromSettlement', () => {
  it('returns 1 when settlement at max', () => {
    const m = {
      settled: true,
      settlementPriceD18: new Prisma.Decimal('1000000000000000000'),
      minPriceD18: new Prisma.Decimal(0),
      maxPriceD18: new Prisma.Decimal('1000000000000000000'),
    };
    expect(outcomeFromSettlement(m)).toBe(1);
  });

  it('returns 0 when settlement at min', () => {
    const m = {
      settled: true,
      settlementPriceD18: new Prisma.Decimal(0),
      minPriceD18: new Prisma.Decimal(0),
      maxPriceD18: new Prisma.Decimal('1000000000000000000'),
    };
    expect(outcomeFromSettlement(m)).toBe(0);
  });

  it('returns null for numeric/non-binary', () => {
    const m = {
      settled: true,
      settlementPriceD18: new Prisma.Decimal('500000000000000000'), // 0.5
      minPriceD18: new Prisma.Decimal(0),
      maxPriceD18: new Prisma.Decimal('1000000000000000000'),
    };
    expect(outcomeFromSettlement(m)).toBeNull();
  });
});
