import { describe, test, expect } from 'vitest';
import type { Address } from 'viem';
import {
  computeSmartAccountAddress,
  FACTORY,
  INIT_CODE_HASH,
  ECDSA_VALIDATOR,
  VALIDATOR_TYPE_SECONDARY,
} from './smartAccount';

// ZeroDev SDK constants (devDependency oracle)
import {
  KernelVersionToAddressesMap,
  VALIDATOR_TYPE,
} from '@zerodev/sdk/constants';
import { kernelVersionRangeToValidator } from '@zerodev/ecdsa-validator/constants';

// ---------------------------------------------------------------------------
// Test EOAs
// ---------------------------------------------------------------------------

const EOA_1 = '0x1234567890AbcdEF1234567890aBcdef12345678' as Address;
const EOA_2 = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address;
const EOA_3 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;

// ---------------------------------------------------------------------------
// Hardcoded regression pair (captured from verified pure CREATE2 computation)
// If this test fails, the address derivation has changed — investigate!
// ---------------------------------------------------------------------------

const REGRESSION_EOA = '0x09745448f386ec8994F0A38a853D909173A8660f' as Address;
const REGRESSION_SA = '0x314ace01C6B2e5e16113036fb1F6286C509FC373' as Address;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeSmartAccountAddress (pure CREATE2)', () => {
  test('matches hardcoded regression pair', () => {
    const result = computeSmartAccountAddress(REGRESSION_EOA);
    expect(result.toLowerCase()).toBe(REGRESSION_SA.toLowerCase());
  });

  test('matches known golden value for EOA #2', () => {
    const result = computeSmartAccountAddress(EOA_2);
    expect(result.toLowerCase()).toBe(
      '0x0dC21370FA530e615e9090Aa1e5171973804d234'.toLowerCase()
    );
  });

  test('matches known golden value for EOA #3', () => {
    const result = computeSmartAccountAddress(EOA_3);
    expect(result.toLowerCase()).toBe(
      '0xBD8FD5dE34791a8BeefB4286F0eEb2AF934Ef944'.toLowerCase()
    );
  });

  test('returns Address, not Promise (sync)', () => {
    const result = computeSmartAccountAddress(EOA_1);
    // If this were async, result would be a Promise
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Double-check it's not a thenable
    expect((result as unknown as Record<string, unknown>).then).toBeUndefined();
  });

  test('is deterministic — same input produces same output', () => {
    const a = computeSmartAccountAddress(EOA_1);
    const b = computeSmartAccountAddress(EOA_1);
    expect(a).toBe(b);
  });

  test('is case-insensitive on input address (lowercase vs checksummed)', () => {
    const lower = computeSmartAccountAddress(EOA_1.toLowerCase() as Address);
    const mixed = computeSmartAccountAddress(EOA_1);
    expect(lower.toLowerCase()).toBe(mixed.toLowerCase());
  });

  test('different EOAs produce different smart accounts', () => {
    const sa1 = computeSmartAccountAddress(EOA_1);
    const sa2 = computeSmartAccountAddress(EOA_2);
    const sa3 = computeSmartAccountAddress(EOA_3);
    expect(sa1.toLowerCase()).not.toBe(sa2.toLowerCase());
    expect(sa1.toLowerCase()).not.toBe(sa3.toLowerCase());
    expect(sa2.toLowerCase()).not.toBe(sa3.toLowerCase());
  });
});

describe('hardcoded constants validation', () => {
  const v31Addresses = KernelVersionToAddressesMap['0.3.1'];

  test('factory matches ZeroDev KernelVersionToAddressesMap["0.3.1"]', () => {
    expect(FACTORY).toBe(v31Addresses.factoryAddress);
  });

  test('initCodeHash matches ZeroDev KernelVersionToAddressesMap["0.3.1"]', () => {
    expect(INIT_CODE_HASH).toBe(v31Addresses.initCodeHash);
  });

  test('ecdsaValidator matches ZeroDev kernelVersionRangeToValidator', () => {
    // Installed @zerodev/ecdsa-validator@5.3.3 uses key "0.3.1"
    const validatorAddress =
      kernelVersionRangeToValidator['>=0.3.1'] ??
      kernelVersionRangeToValidator['0.3.1'];
    expect(ECDSA_VALIDATOR).toBe(validatorAddress);
  });

  test('VALIDATOR_TYPE.SECONDARY matches ZeroDev constants', () => {
    expect(VALIDATOR_TYPE_SECONDARY).toBe(VALIDATOR_TYPE.SECONDARY);
  });
});
