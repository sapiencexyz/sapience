/**
 * Auction simulation utilities.
 *
 * Tier 3 validation: simulates the on-chain mint() call via eth_call
 * with state overrides. Catches contract-level reverts (bad picks,
 * resolver rejections, signature issues, counterparty fund shortfalls)
 * before the real transaction fires.
 *
 * Also exports pure helpers for Solady storage slot computation,
 * state override construction, and error parsing.
 *
 * @module auction/simulate
 */

import {
  concat,
  encodeFunctionData,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { predictionMarketEscrowAbi } from '../abis';

/** 32-byte zero ref code (no referral). */
const ZERO_REF_CODE = ('0x' + '00'.repeat(32)) as Hex;

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
    ['InvalidCounterpartySignature', 'Invalid counterparty signature'],
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
  /** Wei amount of collateral to override (used to size the state override). */
  collateralAmountWei: bigint;
}): Array<{
  address: `0x${string}`;
  balance?: bigint;
  stateDiff?: Array<{ slot: `0x${string}`; value: `0x${string}` }>;
}> {
  const {
    simulationAddress,
    collateralTokenAddress,
    predictionMarketAddress,
    collateralAmountWei,
  } = params;

  const balanceSlot = getSoladyBalanceSlot(simulationAddress);
  const allowanceSlot = getSoladyAllowanceSlot(
    simulationAddress,
    predictionMarketAddress
  );
  const sufficientBalance = collateralAmountWei + 1n;

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

// ─── Tier 3: Mint Simulation ────────────────────────────────────────────────

/** Pick data for mint simulation (matches contract IV2Types.Pick). */
export interface SimulateMintPick {
  conditionResolver: Address;
  conditionId: Hex;
  predictedOutcome: number;
}

/** Parameters for Tier 3 mint simulation. */
export interface SimulateMintParams {
  picks: SimulateMintPick[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  predictorNonce: bigint;
  counterpartyNonce: bigint;
  predictorDeadline: bigint;
  counterpartyDeadline: bigint;
  predictorSignature: Hex;
  counterpartySignature: Hex;
  refCode?: Hex;
  predictorSessionKeyData?: Hex;
  counterpartySessionKeyData?: Hex;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
}

export interface SimulateMintOptions {
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  publicClient: PublicClient;
  /**
   * Check predictor's real on-chain balance instead of overriding it.
   * Default false — the approve is part of the same batch, so we override
   * both balance and allowance to simulate the batch executing atomically.
   */
  checkPredictorBalance?: boolean;
}

export interface SimulateMintResult {
  success: boolean;
  error?: string;
  /** True if the error was a contract revert (vs RPC/network failure). */
  isRevert?: boolean;
}

/**
 * Tier 3 validation: simulate the mint() call via eth_call.
 *
 * Overrides the predictor's ERC-20 allowance (and optionally balance) to
 * simulate the approve that would execute earlier in the batch. Uses the
 * counterparty's real on-chain balance/allowance — this is the validation
 * point (confirming their funds are actually available).
 *
 * Catches all contract-level reverts: bad picks, resolver rejections,
 * signature failures, collateral minimums, counterparty fund shortfalls, etc.
 */
export async function simulateMint(
  params: SimulateMintParams,
  opts: SimulateMintOptions
): Promise<SimulateMintResult> {
  const {
    predictionMarketAddress,
    collateralTokenAddress,
    publicClient,
    checkPredictorBalance = false,
  } = opts;

  // Build state overrides for the predictor's allowance (simulates the
  // approve call that precedes mint in the batch). If checkPredictorBalance
  // is false (default), also override the predictor's balance so we don't
  // fail on insufficient funds — the form's balance context guards that.
  const predictorOverrides = buildSimulationStateOverride({
    simulationAddress: params.predictor,
    collateralTokenAddress,
    predictionMarketAddress,
    collateralAmountWei: params.predictorCollateral,
  });

  // When checking predictor balance, only override allowance (not balance)
  let stateOverride: StateOverrideEntry[];
  if (checkPredictorBalance) {
    // Strip balance override, keep only allowance
    const allowanceOnly: StateOverrideEntry[] = predictorOverrides.map(
      (entry) => {
        if (entry.address.toLowerCase() === params.predictor.toLowerCase()) {
          // Remove the native balance override for the predictor account
          return { address: entry.address };
        }
        if (
          entry.address.toLowerCase() === collateralTokenAddress.toLowerCase()
        ) {
          // Keep only allowance slot, strip balance slot
          const allowanceSlot = getSoladyAllowanceSlot(
            params.predictor,
            predictionMarketAddress
          );
          return {
            address: entry.address,
            stateDiff: entry.stateDiff?.filter(
              (sd) => sd.slot.toLowerCase() === allowanceSlot.toLowerCase()
            ),
          };
        }
        return entry;
      }
    );
    stateOverride = allowanceOnly;
  } else {
    stateOverride = predictorOverrides;
  }

  // Encode the mint calldata
  const mintCalldata = encodeFunctionData({
    abi: predictionMarketEscrowAbi,
    functionName: 'mint',
    args: [
      {
        picks: params.picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: params.predictorCollateral,
        counterpartyCollateral: params.counterpartyCollateral,
        predictor: params.predictor,
        counterparty: params.counterparty,
        predictorNonce: params.predictorNonce,
        counterpartyNonce: params.counterpartyNonce,
        predictorDeadline: params.predictorDeadline,
        counterpartyDeadline: params.counterpartyDeadline,
        predictorSignature: params.predictorSignature,
        counterpartySignature: params.counterpartySignature,
        refCode: params.refCode ?? ZERO_REF_CODE,
        predictorSessionKeyData: params.predictorSessionKeyData ?? '0x',
        counterpartySessionKeyData: params.counterpartySessionKeyData ?? '0x',
        predictorSponsor: params.predictorSponsor ?? zeroAddress,
        predictorSponsorData: params.predictorSponsorData ?? '0x',
      },
    ],
  });

  try {
    // eth_call with state overrides — simulates the mint without sending a tx.
    // We use raw `call` instead of `simulateContract` because viem's
    // simulateContract doesn't support stateOverride directly.
    await publicClient.call({
      to: predictionMarketAddress,
      data: mintCalldata,
      account: params.predictor,
      stateOverride,
    });

    return { success: true };
  } catch (err) {
    const revert = isContractRevert(err);
    return {
      success: false,
      error: parseSimulationError(err),
      isRevert: revert,
    };
  }
}
