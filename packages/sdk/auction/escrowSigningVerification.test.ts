/**
 * Tests for Path 3 (smart account owner) in verifyAuctionIntentSignature
 * and verifyCounterpartyMintSignature.
 *
 * Separate file from escrowSigning.test.ts because that file uses real viem
 * functions throughout — adding vi.mock('viem') would break all golden hash tests.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex } from 'viem';

// Mock viem.recoverTypedDataAddress
const mockRecoverTypedDataAddress = vi.fn();
vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    recoverTypedDataAddress: (...args: unknown[]) =>
      mockRecoverTypedDataAddress(...args),
  };
});

// Mock computeSmartAccountAddress
const mockComputeSmartAccountAddress = vi.fn();
vi.mock('../session/smartAccount', () => ({
  computeSmartAccountAddress: (...args: unknown[]) =>
    mockComputeSmartAccountAddress(...args),
}));

import {
  verifyAuctionIntentSignature,
  verifyCounterpartyMintSignature,
} from './escrowSigning';

// --- Test fixtures ---

const OWNER_EOA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const PREDICTOR_SA = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const COUNTERPARTY_SA = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
const UNRELATED_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address;
const VERIFYING_CONTRACT =
  '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 42161;
const DUMMY_SIG = '0xdeadbeef' as Hex;
const CONDITION_RESOLVER =
  '0x2222222222222222222222222222222222222222' as Address;
const CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const TEST_PICKS = [
  {
    conditionResolver: CONDITION_RESOLVER,
    conditionId: CONDITION_ID,
    predictedOutcome: 1,
  },
];

// --- Tests ---

describe('verifyAuctionIntentSignature — Path 3 (smart account owner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('accepts when recovered signer owns predictor smart account', async () => {
    // Path 2 (EOA) won't match: recovered ≠ predictor
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    // Path 3: computeSmartAccountAddress(OWNER_EOA) → PREDICTOR_SA (matches predictor)
    mockComputeSmartAccountAddress.mockReturnValue(PREDICTOR_SA);

    const result = await verifyAuctionIntentSignature({
      picks: TEST_PICKS,
      predictor: PREDICTOR_SA,
      predictorCollateral: 100n,
      predictorNonce: 1n,
      predictorDeadline: 999999999999n,
      intentSignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(true);
    expect(result.recoveredAddress).toBe(OWNER_EOA);
  });

  test('Path 3 runs unconditionally (no resolveSmartAccountAddress param)', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    mockComputeSmartAccountAddress.mockReturnValue(PREDICTOR_SA);

    // No resolveSmartAccountAddress param — Path 3 should still execute
    await verifyAuctionIntentSignature({
      picks: TEST_PICKS,
      predictor: PREDICTOR_SA,
      predictorCollateral: 100n,
      predictorNonce: 1n,
      predictorDeadline: 999999999999n,
      intentSignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(mockComputeSmartAccountAddress).toHaveBeenCalledWith(OWNER_EOA);
  });

  test('rejects when no path matches', async () => {
    // Recovered signer doesn't match predictor (Path 2 fails)
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    // Smart account doesn't match predictor (Path 3 fails)
    mockComputeSmartAccountAddress.mockReturnValue(UNRELATED_ADDRESS);

    const result = await verifyAuctionIntentSignature({
      picks: TEST_PICKS,
      predictor: PREDICTOR_SA,
      predictorCollateral: 100n,
      predictorNonce: 1n,
      predictorDeadline: 999999999999n,
      intentSignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(false);
  });
});

describe('verifyCounterpartyMintSignature — Path 3 (smart account owner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('accepts when recovered signer owns counterparty smart account', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    mockComputeSmartAccountAddress.mockReturnValue(COUNTERPARTY_SA);

    const result = await verifyCounterpartyMintSignature({
      picks: TEST_PICKS,
      predictorCollateral: 100n,
      counterpartyCollateral: 100n,
      predictor: PREDICTOR_SA,
      counterparty: COUNTERPARTY_SA,
      counterpartyNonce: 1n,
      counterpartyDeadline: 999999999999n,
      counterpartySignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(true);
    expect(result.recoveredAddress).toBe(OWNER_EOA);
  });

  test('Path 3 runs unconditionally', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    mockComputeSmartAccountAddress.mockReturnValue(COUNTERPARTY_SA);

    await verifyCounterpartyMintSignature({
      picks: TEST_PICKS,
      predictorCollateral: 100n,
      counterpartyCollateral: 100n,
      predictor: PREDICTOR_SA,
      counterparty: COUNTERPARTY_SA,
      counterpartyNonce: 1n,
      counterpartyDeadline: 999999999999n,
      counterpartySignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(mockComputeSmartAccountAddress).toHaveBeenCalledWith(OWNER_EOA);
  });

  test('rejects when no path matches', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_EOA);
    mockComputeSmartAccountAddress.mockReturnValue(UNRELATED_ADDRESS);

    const result = await verifyCounterpartyMintSignature({
      picks: TEST_PICKS,
      predictorCollateral: 100n,
      counterpartyCollateral: 100n,
      predictor: PREDICTOR_SA,
      counterparty: COUNTERPARTY_SA,
      counterpartyNonce: 1n,
      counterpartyDeadline: 999999999999n,
      counterpartySignature: DUMMY_SIG,
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(false);
  });
});
