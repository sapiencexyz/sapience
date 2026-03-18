/**
 * Pure functions for ManualConditionResolver settlement
 *
 * Converts Polymarket resolution data to OutcomeVectors and builds
 * calldata for the ManualConditionResolver contract.
 */

import { encodeFunctionData, type Hex } from 'viem';

// ============ Types ============

export interface OutcomeVector {
  yesWeight: bigint;
  noWeight: bigint;
}

// ============ ABI ============

export const manualConditionResolverAbi = [
  {
    type: 'function',
    name: 'getResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes' }],
    outputs: [
      { name: 'resolved', type: 'bool' },
      {
        name: 'outcome',
        type: 'tuple',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'settleCondition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'conditionId', type: 'bytes32' },
      {
        name: 'outcome',
        type: 'tuple',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleConditions',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'conditionIds', type: 'bytes32[]' },
      {
        name: 'outcomes',
        type: 'tuple[]',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

// ============ Pure Functions ============

/**
 * Convert Polymarket payout numerators to an OutcomeVector.
 *
 * Polymarket payouts are [yesPayout, noPayout] from getConditionResolution.
 * - YES wins:  yesPayout > noPayout  → {1, 0}
 * - NO wins:   noPayout > yesPayout  → {0, 1}
 * - Tie/void:  yesPayout === noPayout → {1, 1}
 */
export function determineOutcomeFromPolymarket(
  payoutNumerators: bigint[]
): OutcomeVector {
  if (payoutNumerators.length < 2) {
    throw new Error(
      `Expected at least 2 payout numerators, got ${payoutNumerators.length}`
    );
  }

  if (payoutNumerators.some((v) => v < 0n)) {
    throw new Error(
      `Negative payout numerators are invalid: [${payoutNumerators.join(', ')}]`
    );
  }

  if (payoutNumerators.every((v) => v === 0n)) {
    throw new Error(
      `All-zero payout numerators are invalid: [${payoutNumerators.join(', ')}]`
    );
  }

  const [yesPayout, noPayout] = payoutNumerators;

  if (yesPayout > noPayout) {
    return { yesWeight: 1n, noWeight: 0n };
  } else if (noPayout > yesPayout) {
    return { yesWeight: 0n, noWeight: 1n };
  } else {
    return { yesWeight: 1n, noWeight: 1n };
  }
}

/**
 * Build encoded calldata for settleCondition(bytes32, OutcomeVector)
 */
export function buildSettleCalldata(
  conditionId: Hex,
  outcome: OutcomeVector
): Hex {
  return encodeFunctionData({
    abi: manualConditionResolverAbi,
    functionName: 'settleCondition',
    args: [conditionId, outcome],
  });
}

/**
 * Build encoded calldata for settleConditions(bytes32[], OutcomeVector[])
 */
export function buildBatchSettleCalldata(
  conditionIds: Hex[],
  outcomes: OutcomeVector[]
): Hex {
  if (conditionIds.length !== outcomes.length) {
    throw new Error(
      `Array length mismatch: ${conditionIds.length} conditionIds vs ${outcomes.length} outcomes`
    );
  }

  return encodeFunctionData({
    abi: manualConditionResolverAbi,
    functionName: 'settleConditions',
    args: [conditionIds, outcomes],
  });
}

/**
 * Human-readable outcome label
 */
export function outcomeToString(outcome: OutcomeVector): string {
  if (outcome.yesWeight > 0n && outcome.noWeight === 0n) return 'YES';
  if (outcome.yesWeight === 0n && outcome.noWeight > 0n) return 'NO';
  if (outcome.yesWeight > 0n && outcome.noWeight > 0n) return 'TIE';
  return 'INVALID';
}
