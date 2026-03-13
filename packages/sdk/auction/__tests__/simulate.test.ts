/**
 * Tests for simulation utility functions.
 *
 * Covers:
 * - Pure utility functions (mergeStateOverrides, isContractRevert, etc.)
 * - simulateBidMint (Tier 3: full mint simulation)
 * - simulateBidMintLightweight (Tier 2: on-chain state checks, SimulateBidResult interface)
 */

import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  mergeStateOverrides,
  isContractRevert,
  parseSimulationError,
  buildSimulationStateOverride,
  getSoladyBalanceSlot,
  getSoladyAllowanceSlot,
  simulateBidMint,
  simulateBidMintLightweight,
  type SimulateBidInput,
  type SimulateBidMintOpts,
} from '../simulate';

// ─── mergeStateOverrides ──────────────────────────────────────────────────────

describe('mergeStateOverrides', () => {
  test('two overrides for different addresses → concatenated', () => {
    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];
    const b = [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`,
        balance: 200n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(result[1].address).toBe(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    );
  });

  test('two overrides for same address → stateDiff merged, higher balance kept', () => {
    const slot1 =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
    const slot2 =
      '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;
    const val =
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as `0x${string}`;

    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
        stateDiff: [{ slot: slot1, value: val }],
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 200n,
        stateDiff: [{ slot: slot2, value: val }],
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(200n);
    expect(result[0].stateDiff).toHaveLength(2);
  });

  test('case-insensitive address matching', () => {
    const a = [
      {
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`,
        balance: 100n,
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 50n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(100n);
  });

  test('empty inputs → empty output', () => {
    expect(mergeStateOverrides([], [])).toEqual([]);
  });

  test('one empty, one non-empty', () => {
    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];
    expect(mergeStateOverrides(a, [])).toHaveLength(1);
    expect(mergeStateOverrides([], a)).toHaveLength(1);
  });

  test('merge with only stateDiff (no balance)', () => {
    const slot =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
    const val =
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as `0x${string}`;

    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        stateDiff: [{ slot, value: val }],
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(100n);
    expect(result[0].stateDiff).toHaveLength(1);
  });
});

// ─── isContractRevert ─────────────────────────────────────────────────────────

describe('isContractRevert', () => {
  test('ContractFunctionExecutionError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionExecutionError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('ContractFunctionRevertedError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionRevertedError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('ContractFunctionZeroDataError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionZeroDataError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('message with "execution reverted" → true', () => {
    const err = new Error('The contract execution reverted');
    expect(isContractRevert(err)).toBe(true);
  });

  test('message with "revert" → true', () => {
    const err = new Error('Transaction revert');
    expect(isContractRevert(err)).toBe(true);
  });

  test('network timeout error → false', () => {
    const err = new Error('network timeout');
    expect(isContractRevert(err)).toBe(false);
  });

  test('generic error → false', () => {
    const err = new Error('something went wrong');
    expect(isContractRevert(err)).toBe(false);
  });

  test('non-Error value → false', () => {
    expect(isContractRevert('string error')).toBe(false);
    expect(isContractRevert(null)).toBe(false);
    expect(isContractRevert(undefined)).toBe(false);
    expect(isContractRevert(42)).toBe(false);
  });
});

// ─── parseSimulationError ─────────────────────────────────────────────────────

describe('parseSimulationError', () => {
  test('InvalidSignature → human-readable', () => {
    const err = new Error('InvalidSignature()');
    expect(parseSimulationError(err)).toBe('Invalid signature');
  });

  test('SafeERC20FailedOperation → human-readable', () => {
    const err = new Error('SafeERC20FailedOperation');
    expect(parseSimulationError(err)).toBe(
      'Bidder has insufficient funds or allowance'
    );
  });

  test('non-Error → fallback', () => {
    expect(parseSimulationError('just a string')).toBe('Simulation failed');
  });

  test('long message → truncated', () => {
    const err = new Error('x'.repeat(500));
    const result = parseSimulationError(err);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  test('revert with selector → extracts selector', () => {
    const err = new Error('execution reverted with data 0xdeadbeef');
    expect(parseSimulationError(err)).toContain('0xdeadbeef');
  });
});

// ─── buildSimulationStateOverride ─────────────────────────────────────────────

describe('buildSimulationStateOverride', () => {
  test('returns override entries for simulationAddress and collateralToken', () => {
    const addr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const collateral =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const market =
      '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;

    const result = buildSimulationStateOverride({
      simulationAddress: addr,
      collateralTokenAddress: collateral,
      predictionMarketAddress: market,
      makerCollateralWei: 1000n,
    });

    expect(result).toHaveLength(2);
    expect(result[0].address).toBe(addr);
    expect(result[0].balance).toBe(10n ** 18n);
    expect(result[1].address).toBe(collateral);
    expect(result[1].stateDiff).toHaveLength(2);
  });
});

// ─── Solady slot helpers ──────────────────────────────────────────────────────

describe('getSoladyBalanceSlot', () => {
  test('produces deterministic output', () => {
    const addr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const slot1 = getSoladyBalanceSlot(addr);
    const slot2 = getSoladyBalanceSlot(addr);
    expect(slot1).toBe(slot2);
    expect(slot1.startsWith('0x')).toBe(true);
    expect(slot1.length).toBe(66); // 0x + 64 hex chars
  });
});

describe('getSoladyAllowanceSlot', () => {
  test('produces deterministic output', () => {
    const owner = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const spender =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const slot1 = getSoladyAllowanceSlot(owner, spender);
    const slot2 = getSoladyAllowanceSlot(owner, spender);
    expect(slot1).toBe(slot2);
  });

  test('different spenders produce different slots', () => {
    const owner = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const spender1 =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const spender2 =
      '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;
    expect(getSoladyAllowanceSlot(owner, spender1)).not.toBe(
      getSoladyAllowanceSlot(owner, spender2)
    );
  });
});

// ─── simulateBidMintLightweight ─────────────────────────────────────────────

// Mock the on-chain modules used by simulateBidMintLightweight
vi.mock('../../onchain/escrow', () => ({
  isNonceUsed: vi.fn(),
  createEscrowPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  generateRandomNonce: vi.fn(() => 12345n),
}));

vi.mock('../../onchain/position', () => ({
  validateCounterpartyFunds: vi.fn(),
}));

// Mock the modules used by simulateBidMint
vi.mock('../../abis', () => ({
  predictionMarketEscrowAbi: [{ type: 'function', name: 'mint' }],
}));

vi.mock('../escrowSigning', () => ({
  buildPredictorMintTypedData: vi.fn(() => ({
    domain: { name: 'Test', chainId: 42161n },
    types: { MintApproval: [] },
    primaryType: 'MintApproval',
    message: { predictionHash: '0x' + 'ab'.repeat(32) },
  })),
  buildCounterpartyMintTypedData: vi.fn(() => ({
    domain: { name: 'Test', chainId: 42161n },
    types: { MintApproval: [] },
    primaryType: 'MintApproval',
    message: { predictionHash: '0x' + 'cd'.repeat(32) },
  })),
}));

const PREDICTOR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const COUNTERPARTY = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const MARKET = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
const COLLATERAL_TOKEN =
  '0xdddddddddddddddddddddddddddddddddddddddd' as Address;

function makeBid(overrides: Partial<SimulateBidInput> = {}): SimulateBidInput {
  return {
    counterparty: COUNTERPARTY,
    counterpartyCollateral: '1000000',
    counterpartyNonce: 1,
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    counterpartySignature: '0x' + 'aa'.repeat(65),
    ...overrides,
  };
}

describe('simulateBidMintLightweight', () => {
  let mockIsNonceUsed: Mock;
  let mockValidateCounterpartyFunds: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const escrow = await import('../../onchain/escrow');
    const position = await import('../../onchain/position');
    mockIsNonceUsed = escrow.isNonceUsed as Mock;
    mockValidateCounterpartyFunds = position.validateCounterpartyFunds as Mock;
  });

  test('expired deadline → invalid', async () => {
    const bid = makeBid({ counterpartyDeadline: 1000 }); // in the past
    const result = await simulateBidMintLightweight(bid, {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
    });
    expect(result).toEqual({ isValid: false, error: 'Bid has expired' });
    expect(mockIsNonceUsed).not.toHaveBeenCalled();
  });

  test('used nonce → invalid', async () => {
    mockIsNonceUsed.mockResolvedValue(true);
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
    });
    expect(result).toEqual({
      isValid: false,
      error: 'Bidder nonce is stale',
    });
  });

  test('insufficient funds → invalid with error message', async () => {
    mockIsNonceUsed.mockResolvedValue(false);
    mockValidateCounterpartyFunds.mockRejectedValue(
      new Error('market maker has insufficient balance')
    );
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('market maker');
  });

  test('RPC error + failOpen=true (default) → valid', async () => {
    mockIsNonceUsed.mockRejectedValue(new Error('network timeout'));
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
    });
    expect(result).toEqual({ isValid: true });
  });

  test('RPC error + failOpen=false → invalid', async () => {
    mockIsNonceUsed.mockRejectedValue(new Error('network timeout'));
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      failOpen: false,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('RPC error');
  });

  test('valid bid → { isValid: true }', async () => {
    mockIsNonceUsed.mockResolvedValue(false);
    mockValidateCounterpartyFunds.mockResolvedValue(undefined);
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
    });
    expect(result).toEqual({ isValid: true });
  });

  test('accepts optional publicClient', async () => {
    mockIsNonceUsed.mockResolvedValue(false);
    mockValidateCounterpartyFunds.mockResolvedValue(undefined);
    const mockClient = { readContract: vi.fn() };
    const result = await simulateBidMintLightweight(makeBid(), {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: mockClient as any,
    });
    expect(result).toEqual({ isValid: true });
    // When publicClient is provided, it should be used instead of creating one
    expect(mockValidateCounterpartyFunds).toHaveBeenCalledWith(
      COUNTERPARTY,
      expect.any(BigInt),
      COLLATERAL_TOKEN,
      MARKET,
      mockClient
    );
  });
});

// ─── simulateBidMint ─────────────────────────────────────────────────────────

describe('simulateBidMint', () => {
  const mockSignPredictorApproval = vi.fn<[], Promise<Hex>>();
  let mockSimulateContract: Mock;
  let mockPublicClient: { simulateContract: Mock; readContract: Mock };

  function makeOpts(
    overrides: Partial<SimulateBidMintOpts> = {}
  ): SimulateBidMintOpts {
    return {
      chainId: 42161,
      predictionMarketAddress: MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      predictorAddress: PREDICTOR,
      predictorCollateral: '2000000',
      picks: [
        {
          conditionResolver: MARKET,
          conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
          predictedOutcome: 1,
        },
      ],
      publicClient:
        mockPublicClient as unknown as SimulateBidMintOpts['publicClient'],
      signPredictorApproval: mockSignPredictorApproval,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSimulateContract = vi.fn();
    mockPublicClient = {
      simulateContract: mockSimulateContract,
      readContract: vi.fn(),
    };
    mockSignPredictorApproval.mockResolvedValue(
      ('0x' + 'ee'.repeat(65)) as Hex
    );
  });

  test('successful simulation → { isValid: true }', async () => {
    mockSimulateContract.mockResolvedValue({ result: undefined });

    const result = await simulateBidMint(makeBid(), makeOpts());
    expect(result).toEqual({ isValid: true });
    expect(mockSignPredictorApproval).toHaveBeenCalledOnce();
    expect(mockSimulateContract).toHaveBeenCalledOnce();
  });

  test('contract revert (non-InvalidSignature) → { isValid: false, error }', async () => {
    const err = new Error('CollateralBelowMinimum');
    err.name = 'ContractFunctionRevertedError';
    mockSimulateContract.mockRejectedValue(err);

    const result = await simulateBidMint(makeBid(), makeOpts());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Collateral below minimum');
  });

  test('InvalidSignature revert → falls back to lightweight checks', async () => {
    const err = new Error('InvalidSignature()');
    err.name = 'ContractFunctionRevertedError';
    mockSimulateContract.mockRejectedValue(err);

    // Mock lightweight fallback deps
    const escrow = await import('../../onchain/escrow');
    const position = await import('../../onchain/position');
    (escrow.isNonceUsed as Mock).mockResolvedValue(false);
    (position.validateCounterpartyFunds as Mock).mockResolvedValue(undefined);

    const result = await simulateBidMint(makeBid(), makeOpts());
    expect(result).toEqual({ isValid: true });
    // Lightweight checks were called
    expect(escrow.isNonceUsed).toHaveBeenCalled();
  });

  test('InvalidSignature + expired deadline in fallback → invalid', async () => {
    const err = new Error('InvalidSignature()');
    err.name = 'ContractFunctionRevertedError';
    mockSimulateContract.mockRejectedValue(err);

    const bid = makeBid({ counterpartyDeadline: 1000 }); // expired
    const result = await simulateBidMint(bid, makeOpts());
    expect(result).toEqual({ isValid: false, error: 'Bid has expired' });
  });

  test('InvalidSignature + used nonce in fallback → invalid', async () => {
    const err = new Error('InvalidSignature()');
    err.name = 'ContractFunctionRevertedError';
    mockSimulateContract.mockRejectedValue(err);

    const escrow = await import('../../onchain/escrow');
    (escrow.isNonceUsed as Mock).mockResolvedValue(true);

    const result = await simulateBidMint(makeBid(), makeOpts());
    expect(result).toEqual({
      isValid: false,
      error: 'Bidder nonce is stale',
    });
  });

  test('RPC/network error + failOpen=true (default) → valid', async () => {
    const err = new Error('network timeout');
    mockSimulateContract.mockRejectedValue(err);

    const result = await simulateBidMint(makeBid(), makeOpts());
    expect(result).toEqual({ isValid: true });
  });

  test('RPC/network error + failOpen=false → invalid', async () => {
    const err = new Error('network timeout');
    mockSimulateContract.mockRejectedValue(err);

    const result = await simulateBidMint(
      makeBid(),
      makeOpts({ failOpen: false })
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('RPC error');
  });

  test('signPredictorApproval is called with typed data', async () => {
    mockSimulateContract.mockResolvedValue({ result: undefined });

    await simulateBidMint(makeBid(), makeOpts());

    expect(mockSignPredictorApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.any(Object),
        types: expect.any(Object),
        primaryType: expect.any(String),
        message: expect.any(Object),
      })
    );
  });

  test('state overrides are built for both predictor and counterparty', async () => {
    mockSimulateContract.mockResolvedValue({ result: undefined });

    await simulateBidMint(makeBid(), makeOpts());

    // simulateContract should be called with stateOverride
    const callArgs = mockSimulateContract.mock.calls[0][0];
    expect(callArgs.stateOverride).toBeDefined();
    // Should have entries for both predictor and counterparty gas +
    // collateral token overrides (merged)
    expect(callArgs.stateOverride.length).toBeGreaterThanOrEqual(2);
  });
});
