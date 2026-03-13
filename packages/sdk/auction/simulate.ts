/**
 * Bid simulation utilities for auction validation.
 *
 * Contains both pure helpers (storage slots, error parsing, state overrides)
 * and the full mint simulation function (`simulateBidMint`).
 *
 * @module auction/simulate
 */

import type { Address, Hex, PublicClient } from 'viem';
import { concat, keccak256, toHex, verifyTypedData, zeroAddress } from 'viem';
import type { Pick } from '../types/escrow';

// ─── Solady ERC20 Storage Slot Helpers ───────────────────────────────────────

/**
 * Solady ERC20 storage slot constants.
 * See: https://github.com/Vectorized/solady/blob/main/src/tokens/ERC20.sol
 *
 * - Balance slot = keccak256(owner || BALANCE_SLOT_SEED)
 * - Allowance slot = keccak256(owner || ALLOWANCE_SLOT_SEED || spender)
 */
const SOLADY_BALANCE_SLOT_SEED = '0x000000000000000087a211a2' as `0x${string}`;
const SOLADY_ALLOWANCE_SLOT_SEED =
  '0x00000000000000007f5e9f20' as `0x${string}`;

/**
 * Compute the Solady ERC20 balance storage slot for a given owner.
 * Formula: keccak256(owner(20 bytes) || BALANCE_SLOT_SEED(12 bytes))
 */
export function getSoladyBalanceSlot(owner: `0x${string}`): `0x${string}` {
  return keccak256(concat([owner, SOLADY_BALANCE_SLOT_SEED]));
}

/**
 * Compute the Solady ERC20 allowance storage slot for a given owner→spender pair.
 * Formula: keccak256(owner(20 bytes) || ALLOWANCE_SLOT_SEED(12 bytes) || spender(20 bytes))
 */
export function getSoladyAllowanceSlot(
  owner: `0x${string}`,
  spender: `0x${string}`
): `0x${string}` {
  return keccak256(concat([owner, SOLADY_ALLOWANCE_SLOT_SEED, spender]));
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Execution mode for bid simulation.
 * - 'eoa': EOA mode
 * - 'session': Smart account with active session
 * - 'owner': Smart account without session
 */
export type ExecutionMode = 'eoa' | 'session' | 'owner';

/** Result of a bid simulation. */
export interface SimulateBidResult {
  isValid: boolean;
  error?: string;
}

/** Bid data from the API (bidder/market maker). */
export interface BidData {
  maker: string;
  makerCollateral: string;
  makerDeadline: number;
  makerSignature: string;
  makerNonce: number;
}

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface LegacyValidatedBid<T extends BidData> {
  bid: T;
  validationStatus: ValidationStatus;
  validationError?: string;
}

/**
 * Options for simulating a bid mint transaction.
 */
export interface SimulateBidMintOptions {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  takerAddress: `0x${string}`;
  takerCollateral: string;
  takerNonce: number;
  encodedPredictedOutcomes: `0x${string}`;
  resolver: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  executionMode?: ExecutionMode;
  smartAccountAddress?: `0x${string}`;
}

// ─── Simulation Error Parsing ────────────────────────────────────────────────

/**
 * Parse a contract simulation error into a human-readable message.
 * Centralises the error-message mapping previously duplicated in app code.
 */
export function parseSimulationError(err: unknown): string {
  if (!(err instanceof Error)) return 'Simulation failed';

  const msg = err.message;

  const mappings: [string, string][] = [
    ['InvalidSignature', 'Invalid signature'],
    ['InvalidTakerSignature', 'Invalid bid signature'],
    ['TakerDeadlineExpired', 'Bid has expired'],
    ['InvalidMakerNonce', 'Nonce already used'],
    ['InvalidTakerNonce', 'Bidder nonce is stale'],
    ['SafeERC20FailedOperation', 'Bidder has insufficient funds or allowance'],
    ['InsufficientAllowance', 'Bidder has insufficient allowance'],
    ['InsufficientBalance', 'Bidder has insufficient balance'],
    ['AllowanceExpired', "Bidder's allowance has expired"],
    ['0x13be252b', 'Bidder has insufficient allowance'],
    ['CollateralBelowMinimum', 'Collateral below minimum'],
    [
      'MakerCollateralMustBeGreaterThanZero',
      'Maker collateral must be greater than zero',
    ],
    [
      'TakerCollateralMustBeGreaterThanZero',
      'Taker collateral must be greater than zero',
    ],
    [
      'InvalidMarketsAccordingToResolver',
      'Invalid markets according to resolver',
    ],
    ['InvalidEncodedPredictedOutcomes', 'Invalid encoded predicted outcomes'],
    ['MakerIsNotCaller', 'Simulation error: msg.sender mismatch'],
  ];

  for (const [pattern, message] of mappings) {
    if (msg.includes(pattern)) return message;
  }

  if (msg.includes('revert') || msg.includes('execution reverted')) {
    const selectorMatch = msg.match(/0x[a-fA-F0-9]{8}/);
    return selectorMatch
      ? `Contract reverted with selector: ${selectorMatch[0]}`
      : 'Contract execution reverted';
  }

  if (msg.includes('unknown error') || msg.includes('Unknown error')) {
    const viemErr = err as { cause?: { data?: string }; data?: string };
    const errorData = viemErr.data || viemErr.cause?.data;
    if (errorData && typeof errorData === 'string') {
      return `Unknown contract error (selector: ${errorData.slice(0, 10)})`;
    }
    const selectorMatch = msg.match(/0x[a-fA-F0-9]{8,}/);
    return selectorMatch
      ? `Unknown contract error (data: ${selectorMatch[0].slice(0, 18)}...)`
      : 'Unknown contract error';
  }

  return msg.slice(0, 200);
}

/**
 * Build the state override entries for a bid simulation.
 * Returns the stateOverride array that can be passed to viem's simulateContract.
 */
export function buildSimulationStateOverride(params: {
  simulationAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  predictionMarketAddress: `0x${string}`;
  makerCollateralWei: bigint;
}): Array<{
  address: `0x${string}`;
  balance?: bigint;
  stateDiff?: Array<{ slot: `0x${string}`; value: `0x${string}` }>;
}> {
  const {
    simulationAddress,
    collateralTokenAddress,
    predictionMarketAddress,
    makerCollateralWei,
  } = params;

  const balanceSlot = getSoladyBalanceSlot(simulationAddress);
  const allowanceSlot = getSoladyAllowanceSlot(
    simulationAddress,
    predictionMarketAddress
  );
  const sufficientBalance = makerCollateralWei + 1n;

  return [
    {
      address: simulationAddress,
      balance: 10n ** 18n,
    },
    {
      address: collateralTokenAddress,
      stateDiff: [
        {
          slot: balanceSlot,
          value: toHex(sufficientBalance, { size: 32 }),
        },
        {
          slot: allowanceSlot,
          value: toHex(sufficientBalance, { size: 32 }),
        },
      ],
    },
  ];
}

// ─── State Override Merging ───────────────────────────────────────────────────

type StateOverrideEntry = {
  address: `0x${string}`;
  balance?: bigint;
  stateDiff?: Array<{ slot: `0x${string}`; value: `0x${string}` }>;
};

/**
 * Merge two state override arrays, combining stateDiff entries for
 * the same address (the collateral token will appear in both when
 * building overrides for predictor and counterparty).
 *
 * Note: stateDiff entries are concatenated, not deduplicated by slot.
 * In practice, predictor and counterparty have different addresses so
 * their Solady balance/allowance slots are always distinct even when
 * they share the same collateral token address.
 */
export function mergeStateOverrides(
  a: StateOverrideEntry[],
  b: StateOverrideEntry[]
): StateOverrideEntry[] {
  const map = new Map<string, StateOverrideEntry>();

  for (const entry of [...a, ...b]) {
    const key = entry.address.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      // Merge: keep higher balance, concat stateDiff
      existing.balance =
        existing.balance && entry.balance
          ? existing.balance > entry.balance
            ? existing.balance
            : entry.balance
          : existing.balance || entry.balance;
      if (entry.stateDiff) {
        existing.stateDiff = [
          ...(existing.stateDiff || []),
          ...entry.stateDiff,
        ];
      }
    } else {
      map.set(key, { ...entry });
    }
  }

  return Array.from(map.values());
}

// ─── Error Classification ────────────────────────────────────────────────────

/**
 * Check if an error is a contract revert (vs RPC/network error).
 *
 * Viem throws typed error classes with a `name` property for contract reverts.
 * We check `name` first (reliable), then fall back to message keywords.
 */
export function isContractRevert(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Viem error class names (set via BaseError)
  const name = (err as { name?: string }).name ?? '';
  if (
    name === 'ContractFunctionExecutionError' ||
    name === 'ContractFunctionRevertedError' ||
    name === 'ContractFunctionZeroDataError'
  ) {
    return true;
  }

  // Fallback: check message for revert keywords
  const msg = err.message;
  return msg.includes('execution reverted') || msg.includes('revert');
}

// ─── Tier 3: Full Mint Simulation ──────────────────────────────────────────

/** Bid fields required for simulation. */
export interface SimulateBidInput {
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
}

/** Options for `simulateBidMint`. */
export interface SimulateBidMintOpts {
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  predictorAddress: Address;
  predictorCollateral: string; // wei
  picks: Pick[];
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
  publicClient: PublicClient;
  /** Signs the predictor's MintApproval typed data (session key, non-interactive). */
  signPredictorApproval: (params: {
    domain: {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: Address;
    };
    types: Record<
      string,
      readonly { readonly name: string; readonly type: string }[]
    >;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
  /** When true (default), RPC/network errors return { isValid: true }. */
  failOpen?: boolean;
}

/**
 * Tier 3: Full mint simulation.
 *
 * Simulates PredictionMarketEscrow.mint() with state overrides for both
 * predictor and counterparty balance/allowance. On InvalidSignature revert
 * (expected in session mode — simulateContract can't replicate predictor's
 * smart account ERC-1271 context), falls back to Tier 2 on-chain checks.
 */
export async function simulateBidMint(
  bid: SimulateBidInput,
  opts: SimulateBidMintOpts
): Promise<SimulateBidResult> {
  const {
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picks,
    predictorSponsor = zeroAddress,
    predictorSponsorData = '0x' as Hex,
    publicClient,
    signPredictorApproval,
    failOpen = true,
  } = opts;

  // Dynamic imports to avoid circular dependencies
  const [
    { predictionMarketEscrowAbi },
    { buildPredictorMintTypedData, buildCounterpartyMintTypedData },
    { generateRandomNonce },
  ] = await Promise.all([
    import('../abis'),
    import('./escrowSigning'),
    import('../onchain/escrow'),
  ]);

  const predictorCollateralWei = BigInt(predictorCollateral);
  const counterpartyCollateralWei = BigInt(bid.counterpartyCollateral);
  const counterparty = bid.counterparty as Address;

  // Generate a fresh nonce and deadline for simulation-only predictor signature
  const predictorNonce = generateRandomNonce();
  const predictorDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  try {
    // 1. Build predictor's MintApproval typed data
    const typedData = buildPredictorMintTypedData({
      picks,
      predictorCollateral: predictorCollateralWei,
      counterpartyCollateral: counterpartyCollateralWei,
      predictor: predictorAddress,
      counterparty,
      predictorNonce,
      predictorDeadline,
      predictorSponsor,
      predictorSponsorData,
      verifyingContract: predictionMarketAddress,
      chainId,
    });

    // 2. Sign via session key (non-interactive)
    const predictorSignature = await signPredictorApproval({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    // 3. Build the full escrow MintRequest struct
    const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;
    const mintRequest = {
      picks: picks.map((p) => ({
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
      predictorCollateral: predictorCollateralWei,
      counterpartyCollateral: counterpartyCollateralWei,
      predictor: predictorAddress,
      counterparty,
      predictorNonce,
      counterpartyNonce: BigInt(bid.counterpartyNonce),
      predictorDeadline,
      counterpartyDeadline: BigInt(bid.counterpartyDeadline),
      predictorSignature,
      counterpartySignature: bid.counterpartySignature as Hex,
      refCode: ZERO_BYTES32,
      predictorSessionKeyData: '0x' as Hex,
      counterpartySessionKeyData: (bid.counterpartySessionKeyData ||
        '0x') as Hex,
      predictorSponsor,
      predictorSponsorData,
    };

    // 4. Build state overrides for BOTH predictor and counterparty
    const predictorOverrides = buildSimulationStateOverride({
      simulationAddress: predictorAddress,
      collateralTokenAddress,
      predictionMarketAddress,
      makerCollateralWei: predictorCollateralWei,
    });

    const counterpartyOverrides = buildSimulationStateOverride({
      simulationAddress: counterparty,
      collateralTokenAddress,
      predictionMarketAddress,
      makerCollateralWei: counterpartyCollateralWei,
    });

    const stateOverride = mergeStateOverrides(
      predictorOverrides,
      counterpartyOverrides
    );

    // 5. Simulate the mint call
    await publicClient.simulateContract({
      address: predictionMarketAddress,
      abi: predictionMarketEscrowAbi,
      functionName: 'mint',
      args: [mintRequest],
      account: predictorAddress,
      stateOverride,
    });

    return { isValid: true };
  } catch (err: unknown) {
    // Distinguish contract reverts from RPC/network errors
    if (isContractRevert(err)) {
      const errorMessage = parseSimulationError(err);

      const rawMessage = err instanceof Error ? err.message : '';
      const isInvalidSig =
        rawMessage.includes('InvalidSignature') ||
        (errorMessage.includes('Invalid') &&
          errorMessage.includes('signature'));

      if (isInvalidSig) {
        // InvalidSignature is expected in session mode: simulateContract can't
        // replicate the predictor's smart account ERC-1271 context.
        //
        // Try to verify the counterparty sig off-chain. If ecrecover doesn't
        // match, the counterparty may be a smart contract (e.g. a vault) with
        // its own isValidSignature — the on-chain mint will verify it properly,
        // so fall back to lightweight checks either way.
        try {
          const counterpartyTypedData = buildCounterpartyMintTypedData({
            picks,
            predictorCollateral: predictorCollateralWei,
            counterpartyCollateral: counterpartyCollateralWei,
            predictor: predictorAddress,
            counterparty,
            counterpartyNonce: BigInt(bid.counterpartyNonce),
            counterpartyDeadline: BigInt(bid.counterpartyDeadline),
            predictorSponsor,
            predictorSponsorData,
            verifyingContract: predictionMarketAddress,
            chainId,
          });
          await verifyTypedData({
            address: counterparty,
            domain: {
              ...counterpartyTypedData.domain,
              chainId: Number(counterpartyTypedData.domain.chainId),
            },
            types: counterpartyTypedData.types,
            primaryType: counterpartyTypedData.primaryType,
            message: counterpartyTypedData.message,
            signature: bid.counterpartySignature as Hex,
          });
        } catch {
          // ecrecover failed (malformed sig or smart account) — not fatal,
          // fall through to lightweight checks
        }

        // Fall back to Tier 2 lightweight checks (deadline/nonce/balance)
        return simulateBidMintLightweight(bid, {
          chainId,
          predictionMarketAddress,
          collateralTokenAddress,
          failOpen,
        });
      }

      return { isValid: false, error: errorMessage };
    }

    // RPC/network error — configurable via failOpen
    if (failOpen) {
      return { isValid: true };
    }
    return {
      isValid: false,
      error: `RPC error: ${err instanceof Error ? err.message.slice(0, 200) : 'Unknown'}`,
    };
  }
}

// ─── Lightweight Validation (Tier 2, SimulateBidResult interface) ────────

/**
 * Lightweight on-chain validation returning SimulateBidResult.
 *
 * Checks deadline expiry, nonce usage, and balance/allowance.
 * Used as a fallback from `simulateBidMint` on InvalidSignature revert,
 * and as the primary validation path in EOA mode.
 *
 * On RPC errors, configurable via `failOpen` (default true = treat as valid).
 */
export async function simulateBidMintLightweight(
  bid: {
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
  },
  opts: {
    chainId: number;
    predictionMarketAddress: Address;
    collateralTokenAddress: Address;
    publicClient?: PublicClient;
    failOpen?: boolean;
  }
): Promise<SimulateBidResult> {
  const failOpen = opts.failOpen ?? true;
  const counterparty = bid.counterparty as Address;
  const counterpartyCollateralWei = BigInt(bid.counterpartyCollateral);

  // 1. Check deadline expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (bid.counterpartyDeadline <= nowSec) {
    return { isValid: false, error: 'Bid has expired' };
  }

  try {
    // Dynamic imports to avoid circular dependency
    const { isNonceUsed, createEscrowPublicClient } = await import(
      '../onchain/escrow'
    );
    const { validateCounterpartyFunds } = await import('../onchain/position');

    // 2. Check counterparty nonce
    const nonceUsed = await isNonceUsed(
      counterparty,
      BigInt(bid.counterpartyNonce),
      { chainId: opts.chainId, marketAddress: opts.predictionMarketAddress }
    );
    if (nonceUsed) {
      return { isValid: false, error: 'Bidder nonce is stale' };
    }

    // 3. Check counterparty balance/allowance
    const client =
      opts.publicClient ?? createEscrowPublicClient(undefined, opts.chainId);
    await validateCounterpartyFunds(
      counterparty,
      counterpartyCollateralWei,
      opts.collateralTokenAddress,
      opts.predictionMarketAddress,
      client
    );

    return { isValid: true };
  } catch (err) {
    // validateCounterpartyFunds throws with 'market maker' message on insufficient funds
    if (err instanceof Error && err.message.includes('market maker')) {
      return { isValid: false, error: err.message };
    }

    // RPC/network error
    if (failOpen) {
      return { isValid: true };
    }
    return {
      isValid: false,
      error: `RPC error: ${err instanceof Error ? err.message.slice(0, 200) : 'Unknown'}`,
    };
  }
}
