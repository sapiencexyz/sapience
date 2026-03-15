import { describe, test, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  computeTokenSalt,
  predictTokenAddress,
  predictTokenPair,
  getTokenFactoryAddress,
} from '../tokenAddress';

const SAMPLE_PICK_CONFIG_ID =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
const SAMPLE_FACTORY = '0xea76782164474ec59b647C5be21FAFD0Ecf936BD' as Address;

// ─── computeTokenSalt ────────────────────────────────────────────────────────

describe('computeTokenSalt', () => {
  test('returns deterministic result', () => {
    const salt1 = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, true);
    const salt2 = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, true);
    expect(salt1).toBe(salt2);
  });

  test('different booleans produce different salts', () => {
    const saltTrue = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, true);
    const saltFalse = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, false);
    expect(saltTrue).not.toBe(saltFalse);
  });

  test('different pickConfigIds produce different salts', () => {
    const otherId =
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
    const salt1 = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, true);
    const salt2 = computeTokenSalt(otherId, true);
    expect(salt1).not.toBe(salt2);
  });

  test('returns a bytes32 hex string', () => {
    const salt = computeTokenSalt(SAMPLE_PICK_CONFIG_ID, true);
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ─── predictTokenAddress ─────────────────────────────────────────────────────

describe('predictTokenAddress', () => {
  test('returns deterministic address', () => {
    const addr1 = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      true,
      SAMPLE_FACTORY
    );
    const addr2 = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      true,
      SAMPLE_FACTORY
    );
    expect(addr1).toBe(addr2);
  });

  test('different sides produce different addresses', () => {
    const predictor = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      true,
      SAMPLE_FACTORY
    );
    const counterparty = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      false,
      SAMPLE_FACTORY
    );
    expect(predictor).not.toBe(counterparty);
  });

  test('returns a valid address format', () => {
    const addr = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      true,
      SAMPLE_FACTORY
    );
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

// ─── predictTokenPair ────────────────────────────────────────────────────────

describe('predictTokenPair', () => {
  test('returns both predictor and counterparty tokens', () => {
    const pair = predictTokenPair(SAMPLE_PICK_CONFIG_ID, SAMPLE_FACTORY);
    expect(pair.predictorToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(pair.counterpartyToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('predictor and counterparty are different', () => {
    const pair = predictTokenPair(SAMPLE_PICK_CONFIG_ID, SAMPLE_FACTORY);
    expect(pair.predictorToken).not.toBe(pair.counterpartyToken);
  });

  test('matches individual predictTokenAddress calls', () => {
    const pair = predictTokenPair(SAMPLE_PICK_CONFIG_ID, SAMPLE_FACTORY);
    const predictor = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      true,
      SAMPLE_FACTORY
    );
    const counterparty = predictTokenAddress(
      SAMPLE_PICK_CONFIG_ID,
      false,
      SAMPLE_FACTORY
    );
    expect(pair.predictorToken).toBe(predictor);
    expect(pair.counterpartyToken).toBe(counterparty);
  });
});

// ─── getTokenFactoryAddress ──────────────────────────────────────────────────

describe('getTokenFactoryAddress', () => {
  test('returns address for Ethereal mainnet (5064014)', () => {
    const addr = getTokenFactoryAddress(5064014);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('returns address for Arbitrum (42161)', () => {
    const addr = getTokenFactoryAddress(42161);
    expect(addr).toBeDefined();
  });

  test('returns undefined for unsupported chain', () => {
    const addr = getTokenFactoryAddress(999999);
    expect(addr).toBeUndefined();
  });
});
