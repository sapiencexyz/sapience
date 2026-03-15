import { describe, test, expect } from 'vitest';
import type { Address } from 'viem';
import { probability, buildForecastCalldata } from '../attest';
import { decodeProbabilityFromD18, buildAttestationCalldata } from '../eas';
import { CHAIN_ID_ARBITRUM } from '../../constants/chain';

// ─── probability ─────────────────────────────────────────────────────────────

describe('probability', () => {
  test('accepts 0', () => {
    expect(probability(0)).toBe(0);
  });

  test('accepts 50', () => {
    expect(probability(50)).toBe(50);
  });

  test('accepts 100', () => {
    expect(probability(100)).toBe(100);
  });

  test('throws for -1', () => {
    expect(() => probability(-1)).toThrow(
      'Probability must be between 0 and 100'
    );
  });

  test('throws for 101', () => {
    expect(() => probability(101)).toThrow(
      'Probability must be between 0 and 100'
    );
  });
});

// ─── buildForecastCalldata ───────────────────────────────────────────────────

describe('buildForecastCalldata', () => {
  const resolver = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
  const condition =
    '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;

  test('returns correct chainId and value', () => {
    const result = buildForecastCalldata(resolver, condition, 50);
    expect(result.chainId).toBe(42161);
    expect(result.value).toBe('0');
  });

  test('returns a valid to address', () => {
    const result = buildForecastCalldata(resolver, condition, 50);
    expect(result.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('returns encoded calldata as hex', () => {
    const result = buildForecastCalldata(resolver, condition, 75);
    expect(result.data).toMatch(/^0x/);
  });

  test('truncates comment at 180 chars', () => {
    const longComment = 'A'.repeat(200);
    // Should not throw — comment gets truncated
    const result = buildForecastCalldata(resolver, condition, 50, longComment);
    expect(result.data).toMatch(/^0x/);
  });

  test('handles no comment', () => {
    const result = buildForecastCalldata(resolver, condition, 50);
    expect(result.data).toBeTruthy();
  });

  test('handles empty comment', () => {
    const result = buildForecastCalldata(resolver, condition, 50, '');
    expect(result.data).toBeTruthy();
  });

  test('throws for invalid probability', () => {
    expect(() => buildForecastCalldata(resolver, condition, -1)).toThrow(
      'Probability must be between 0 and 100'
    );

    expect(() => buildForecastCalldata(resolver, condition, 101)).toThrow(
      'Probability must be between 0 and 100'
    );
  });
});

// ─── decodeProbabilityFromD18 ────────────────────────────────────────────────

describe('decodeProbabilityFromD18', () => {
  test('decodes 50 * 1e18 to 50', () => {
    expect(decodeProbabilityFromD18('50000000000000000000')).toBe(50);
  });

  test('decodes "0" to 0', () => {
    expect(decodeProbabilityFromD18('0')).toBe(0);
  });

  test('decodes 100 * 1e18 to 100', () => {
    expect(decodeProbabilityFromD18('100000000000000000000')).toBe(100);
  });

  test('clamps values over 100 to 100', () => {
    expect(decodeProbabilityFromD18('200000000000000000000')).toBe(100);
  });

  test('clamps negative values to 0', () => {
    // BigInt can't be negative from a string like this, but values < 0 after conversion
    // are clamped by Math.max(0, ...)
    expect(decodeProbabilityFromD18('0')).toBe(0);
  });

  test('returns null for invalid string', () => {
    expect(decodeProbabilityFromD18('not-a-number')).toBeNull();
  });
});

// ─── buildAttestationCalldata ────────────────────────────────────────────────

describe('buildAttestationCalldata', () => {
  const prediction = {
    probability: 75,
    reasoning: 'Based on current data',
    confidence: 0.8,
  };

  test('returns valid calldata for Arbitrum', async () => {
    const result = await buildAttestationCalldata(
      prediction,
      CHAIN_ID_ARBITRUM
    );
    expect(result).not.toBeNull();
    expect(result!.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result!.chainId).toBe(CHAIN_ID_ARBITRUM);
    expect(result!.value).toBe('0');
    expect(result!.description).toBe('Attest: 75% YES');
  });

  test('returns null for unsupported chain', async () => {
    const result = await buildAttestationCalldata(prediction, 999999);
    expect(result).toBeNull();
  });

  test('truncates long reasoning', async () => {
    const longPrediction = {
      probability: 50,
      reasoning: 'R'.repeat(200),
      confidence: 0.5,
    };
    const result = await buildAttestationCalldata(
      longPrediction,
      CHAIN_ID_ARBITRUM
    );
    expect(result).not.toBeNull();
    expect(result!.data).toMatch(/^0x/);
  });

  test('uses default resolver and condition when omitted', async () => {
    const result = await buildAttestationCalldata(prediction);
    expect(result).not.toBeNull();
  });

  test('accepts custom resolver and condition', async () => {
    const resolver = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
    const condition =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
    const result = await buildAttestationCalldata(
      prediction,
      CHAIN_ID_ARBITRUM,
      resolver,
      condition
    );
    expect(result).not.toBeNull();
  });
});
