import { describe, it, expect } from 'vitest';
import { OutcomeSide } from '@sapience/sdk/types';
import {
  normalizeForecastToProbability,
  outcomeFromCondition,
} from './forecastNormalization';

describe('normalizeForecastToProbability', () => {
  it('parses canonical D18 strings into probability floats', () => {
    const res = normalizeForecastToProbability('730000000000000000');
    expect(res.probabilityFloat).toBeCloseTo(0.73, 6);
    expect(res.probabilityD18).toBe('730000000000000000');
  });

  it('returns 0 / 1 endpoints exactly', () => {
    expect(normalizeForecastToProbability('0')).toEqual({
      probabilityFloat: 0,
      probabilityD18: '0',
    });
    const one = normalizeForecastToProbability('1000000000000000000');
    expect(one.probabilityFloat).toBe(1);
    expect(one.probabilityD18).toBe('1000000000000000000');
  });

  it('clamps values above 1e18 down to exactly 1', () => {
    const overflow = normalizeForecastToProbability('2000000000000000000');
    expect(overflow.probabilityFloat).toBe(1);
    expect(overflow.probabilityD18).toBe('1000000000000000000');
  });

  it('rejects non-digit strings as unparseable', () => {
    expect(normalizeForecastToProbability('0.73')).toEqual({
      probabilityFloat: null,
      probabilityD18: null,
    });
    expect(normalizeForecastToProbability('yes')).toEqual({
      probabilityFloat: null,
      probabilityD18: null,
    });
    expect(normalizeForecastToProbability('')).toEqual({
      probabilityFloat: null,
      probabilityD18: null,
    });
  });

  it('handles high D18 probabilities close to 1', () => {
    const nearOne = normalizeForecastToProbability('999999999999999999');
    expect(nearOne.probabilityFloat).toBeLessThanOrEqual(1);
    expect(nearOne.probabilityFloat!).toBeGreaterThan(0.9);
  });
});

describe('outcomeFromCondition', () => {
  it('returns YES when resolved to yes', () => {
    const condition = { settled: true, resolvedToYes: true };
    expect(outcomeFromCondition(condition)).toBe(OutcomeSide.YES);
  });

  it('returns NO when resolved to no', () => {
    const condition = { settled: true, resolvedToYes: false };
    expect(outcomeFromCondition(condition)).toBe(OutcomeSide.NO);
  });

  it('returns null when not settled', () => {
    const condition = { settled: false, resolvedToYes: false };
    expect(outcomeFromCondition(condition)).toBeNull();
  });
});
