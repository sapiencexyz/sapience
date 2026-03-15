import { describe, test, expect, vi } from 'vitest';
import type { Address } from 'viem';
import {
  toBigIntSafe,
  prepareMintCalls,
  validateCounterpartyFunds,
} from '../position';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ARBITRUM,
} from '../../constants/chain';
import { collateralToken } from '../../contracts/addresses';

// ─── toBigIntSafe ────────────────────────────────────────────────────────────

describe('toBigIntSafe', () => {
  test('converts string to bigint', () => {
    expect(toBigIntSafe('123')).toBe(123n);
  });

  test('converts number to bigint', () => {
    expect(toBigIntSafe(42)).toBe(42n);
  });

  test('passes through bigint', () => {
    expect(toBigIntSafe(99n)).toBe(99n);
  });

  test('returns undefined for undefined', () => {
    expect(toBigIntSafe(undefined)).toBeUndefined();
  });
});

// ─── prepareMintCalls ────────────────────────────────────────────────────────

describe('prepareMintCalls', () => {
  // Use digit-only addresses (no a-f) to avoid EIP-55 checksum issues
  const predictor =
    '0x1111111111111111111111111111111111111111' as `0x${string}`;
  const counterparty =
    '0x2222222222222222222222222222222222222222' as `0x${string}`;
  const conditionResolver =
    '0x3333333333333333333333333333333333333333' as `0x${string}`;
  const predictionMarketAddress =
    '0x4444444444444444444444444444444444444444' as Address;
  const sponsorAddress =
    '0x5555555555555555555555555555555555555555' as `0x${string}`;

  const collateralTokenAddress = collateralToken[CHAIN_ID_ETHEREAL]
    .address as Address;

  const baseMintData = {
    predictorCollateral: '1000000000000000000', // 1e18
    counterpartyCollateral: '2000000000000000000', // 2e18
    predictor: predictor as `0x${string}`,
    counterparty: counterparty as `0x${string}`,
    predictorNonce: '1',
    counterpartySignature: '0xdeadbeef' as `0x${string}`,
    counterpartyDeadline: '9999999999',
    predictorDeadline: '9999999999',
    refCode:
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    picks: [
      {
        conditionResolver: conditionResolver as `0x${string}`,
        conditionId:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
        predictedOutcome: 1,
      },
    ],
    counterpartyClaimedNonce: 0,
  };

  test('sponsored mint skips wrap and approve', () => {
    const calls = prepareMintCalls({
      mintData: {
        ...baseMintData,
        predictorSponsor: sponsorAddress as `0x${string}`,
      },
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ETHEREAL,
      currentWusdeBalance: 0n,
      currentAllowance: 0n,
    });
    // Only the mint call
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(predictionMarketAddress);
  });

  test('wrap needed on Ethereal when balance is low', () => {
    const calls = prepareMintCalls({
      mintData: baseMintData,
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ETHEREAL,
      currentWusdeBalance: 0n,
      currentAllowance: 10_000_000_000_000_000_000n,
    });
    // wrap + mint
    expect(calls).toHaveLength(2);
    expect(calls[0].value).toBe(1_000_000_000_000_000_000n);
  });

  test('approve needed when allowance is low', () => {
    const calls = prepareMintCalls({
      mintData: baseMintData,
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ETHEREAL,
      currentWusdeBalance: 10_000_000_000_000_000_000n,
      currentAllowance: 0n,
    });
    // approve + mint
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(collateralTokenAddress);
  });

  test('both wrap and approve needed', () => {
    const calls = prepareMintCalls({
      mintData: baseMintData,
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ETHEREAL,
      currentWusdeBalance: 0n,
      currentAllowance: 0n,
    });
    // wrap + approve + mint
    expect(calls).toHaveLength(3);
  });

  test('non-Ethereal chain skips wrap', () => {
    const calls = prepareMintCalls({
      mintData: baseMintData,
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ARBITRUM,
      currentWusdeBalance: 0n,
      currentAllowance: 0n,
    });
    // approve + mint only (no wrap on non-Ethereal)
    expect(calls).toHaveLength(2);
    // First call is approve, not wrap (no value field)
    expect(calls[0].value).toBeUndefined();
  });

  test('throws for zero predictor collateral', () => {
    expect(() =>
      prepareMintCalls({
        mintData: { ...baseMintData, predictorCollateral: '0' },
        predictionMarketAddress,
        collateralTokenAddress,
        chainId: CHAIN_ID_ETHEREAL,
      })
    ).toThrow('Invalid collateral amounts');
  });

  test('throws for zero counterparty collateral', () => {
    expect(() =>
      prepareMintCalls({
        mintData: { ...baseMintData, counterpartyCollateral: '0' },
        predictionMarketAddress,
        collateralTokenAddress,
        chainId: CHAIN_ID_ETHEREAL,
      })
    ).toThrow('Invalid collateral amounts');
  });

  test('throws for missing nonce', () => {
    expect(() =>
      prepareMintCalls({
        mintData: { ...baseMintData, predictorNonce: undefined },
        predictionMarketAddress,
        collateralTokenAddress,
        chainId: CHAIN_ID_ETHEREAL,
        currentWusdeBalance: 10_000_000_000_000_000_000n,
        currentAllowance: 10_000_000_000_000_000_000n,
      })
    ).toThrow('Missing predictor nonce');
  });

  test('throws for empty picks', () => {
    expect(() =>
      prepareMintCalls({
        mintData: { ...baseMintData, picks: [] },
        predictionMarketAddress,
        collateralTokenAddress,
        chainId: CHAIN_ID_ETHEREAL,
        currentWusdeBalance: 10_000_000_000_000_000_000n,
        currentAllowance: 10_000_000_000_000_000_000n,
      })
    ).toThrow('Mint requires picks');
  });

  test('Ethereal testnet also triggers wrap logic', () => {
    const calls = prepareMintCalls({
      mintData: baseMintData,
      predictionMarketAddress,
      collateralTokenAddress,
      chainId: CHAIN_ID_ETHEREAL_TESTNET,
      currentWusdeBalance: 0n,
      currentAllowance: 10_000_000_000_000_000_000n,
    });
    // wrap + mint
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].value).toBe(1_000_000_000_000_000_000n);
  });
});

// ─── validateCounterpartyFunds ───────────────────────────────────────────────

describe('validateCounterpartyFunds', () => {
  const counterpartyAddress =
    '0x1111111111111111111111111111111111111111' as `0x${string}`;
  const collateralTokenAddr =
    '0x2222222222222222222222222222222222222222' as `0x${string}`;
  const predictionMarketAddr =
    '0x3333333333333333333333333333333333333333' as `0x${string}`;
  const requiredAmount = 1_000_000_000_000_000_000n;

  function makeClient(allowance: bigint, balance: bigint) {
    return {
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'allowance') return Promise.resolve(allowance);
        if (functionName === 'balanceOf') return Promise.resolve(balance);
        return Promise.resolve(0n);
      }),
    };
  }

  test('does not throw when funds are sufficient', async () => {
    const client = makeClient(requiredAmount, requiredAmount);
    await expect(
      validateCounterpartyFunds(
        counterpartyAddress,
        requiredAmount,
        collateralTokenAddr,
        predictionMarketAddr,
        client
      )
    ).resolves.toBeUndefined();
  });

  test('throws when allowance is insufficient', async () => {
    const client = makeClient(0n, requiredAmount);
    await expect(
      validateCounterpartyFunds(
        counterpartyAddress,
        requiredAmount,
        collateralTokenAddr,
        predictionMarketAddr,
        client
      )
    ).rejects.toThrow('market maker has insufficient funds');
  });

  test('throws when balance is insufficient', async () => {
    const client = makeClient(requiredAmount, 0n);
    await expect(
      validateCounterpartyFunds(
        counterpartyAddress,
        requiredAmount,
        collateralTokenAddr,
        predictionMarketAddr,
        client
      )
    ).rejects.toThrow('market maker has insufficient funds');
  });

  test('returns silently when counterparty address is missing', async () => {
    const client = makeClient(0n, 0n);
    await expect(
      validateCounterpartyFunds(
        undefined,
        requiredAmount,
        collateralTokenAddr,
        predictionMarketAddr,
        client
      )
    ).resolves.toBeUndefined();
    expect(client.readContract).not.toHaveBeenCalled();
  });

  test('continues silently on RPC failure', async () => {
    const client = {
      readContract: vi.fn().mockRejectedValue(new Error('network error')),
    };
    await expect(
      validateCounterpartyFunds(
        counterpartyAddress,
        requiredAmount,
        collateralTokenAddr,
        predictionMarketAddr,
        client
      )
    ).resolves.toBeUndefined();
  });
});
