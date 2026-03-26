/**
 * Pure bid simulation utilities for auction validation.
 *
 * Extracted from packages/app/src/lib/auction/simulateBidMint.ts
 * Storage slot helpers and types are pure; the actual simulation function
 * remains in the app because it depends on app-specific RPC client setup.
 *
 * @module auction/simulate
 */

import { concat, keccak256, toHex } from 'viem';

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

/**
 * Bid data from the API (counterparty / market maker).
 *
 * Field mapping to contract MintApproval struct:
 *   counterparty       -> counterparty (address)
 *   counterpartyCollateral -> counterpartyCollateral (uint256)
 *   counterpartyDeadline   -> counterpartyDeadline (uint256)
 *   counterpartySignature  -> counterpartySignature (bytes)
 *   counterpartyNonce      -> counterpartyNonce (uint256)
 */
export interface BidData {
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartyNonce: number;
}

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface LegacyValidatedBid<T extends BidData> {
  bid: T;
  validationStatus: ValidationStatus;
  validationError?: string;
}

/**
 * Options for simulating a bid mint transaction.
 *
 * Field mapping to contract parameters:
 *   predictorAddress -> predictor (the user placing the prediction)
 *   predictorCollateral -> predictorCollateral (uint256)
 *   predictorNonce  -> predictorNonce (uint256)
 */
export interface SimulateBidMintOptions {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  predictorAddress: `0x${string}`;
  predictorCollateral: string;
  predictorNonce: number;
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
    ['InvalidPredictorSignature', 'Invalid predictor signature'],
    ['InvalidCounterpartSignature', 'Invalid counterparty signature'],
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
      'Counterparty collateral must be greater than zero',
    ],
    [
      'TakerCollateralMustBeGreaterThanZero',
      'Predictor collateral must be greater than zero',
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
  /** Wei amount of the counterparty's collateral (used to size the state override). */
  counterpartyCollateralWei: bigint;
}): Array<{
  address: `0x${string}`;
  balance?: bigint;
  stateDiff?: Array<{ slot: `0x${string}`; value: `0x${string}` }>;
}> {
  const {
    simulationAddress,
    collateralTokenAddress,
    predictionMarketAddress,
    counterpartyCollateralWei,
  } = params;

  const balanceSlot = getSoladyBalanceSlot(simulationAddress);
  const allowanceSlot = getSoladyAllowanceSlot(
    simulationAddress,
    predictionMarketAddress
  );
  const sufficientBalance = counterpartyCollateralWei + 1n;

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
