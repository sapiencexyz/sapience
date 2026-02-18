import { describe, it, expect } from 'vitest';
import {
  normalizePredictionToProbability,
  outcomeFromCondition,
} from './predictionNormalization';

describe('normalizePredictionToProbability', () => {
  it('parses yes/no', () => {
    const yes = normalizePredictionToProbability('yes');
    const no = normalizePredictionToProbability('no');
    expect(yes.probabilityFloat).toBe(1);
    expect(no.probabilityFloat).toBe(0);
  });

  it('parses boolean-like 0/1', () => {
    expect(normalizePredictionToProbability('1').probabilityFloat).toBe(1);
    expect(normalizePredictionToProbability('0').probabilityFloat).toBe(0);
  });

  it('parses decimals [0,1]', () => {
    const res = normalizePredictionToProbability('0.73');
    expect(res.probabilityFloat).toBeCloseTo(0.73, 6);
  });

  it('rejects out-of-range decimals', () => {
    const over = normalizePredictionToProbability('1.2');
    const under = normalizePredictionToProbability('-0.1');
    expect(over.probabilityFloat).toBeNull();
    expect(under.probabilityFloat).toBeNull();
  });

  it('parses D18 string', () => {
    const res = normalizePredictionToProbability('730000000000000000');
    expect(res.probabilityFloat).toBeCloseTo(0.73, 6);
  });

  it('handles high D18 probabilities close to 1', () => {
    const nearOne = normalizePredictionToProbability('999999999999999999');
    expect(nearOne.probabilityFloat).toBeLessThanOrEqual(1);
    expect(nearOne.probabilityFloat!).toBeGreaterThan(0.9);
  });
});

describe('outcomeFromCondition', () => {
  it('returns 1 when resolved to yes', () => {
    const condition = { settled: true, resolvedToYes: true };
    expect(outcomeFromCondition(condition)).toBe(1);
  });

  it('returns 0 when resolved to no', () => {
    const condition = { settled: true, resolvedToYes: false };
    expect(outcomeFromCondition(condition)).toBe(0);
  });

  it('returns null when not settled', () => {
    const condition = { settled: false, resolvedToYes: false };
    expect(outcomeFromCondition(condition)).toBeNull();
  });
});
