// On-chain read helpers: which lines are funded, how cells resolved.
// Chain state is the source of truth for both (see DESIGN.md).

import { parseAbi, type Address, type Hex } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types/escrow';
import {
  predictionMarketEscrow as escrowAddresses,
  collateralToken as collateralAddresses,
} from '@sapience/sdk/contracts';
import { CHAIN_ID, getPublicClient } from './session.js';
import type { Line } from './lines.js';
import type { PoolCondition } from './types.js';

export const ESCROW_ADDRESS = escrowAddresses[CHAIN_ID]?.address as
  | Address
  | undefined;
export const COLLATERAL_ADDRESS = collateralAddresses[CHAIN_ID]?.address as
  | Address
  | undefined;

const ESCROW_TOKENPAIR_ABI = parseAbi([
  'function getTokenPair(bytes32 pickConfigId) view returns ((address predictorToken, address counterpartyToken))',
]);

const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

const RESOLVER_ABI = parseAbi([
  'function getResolution(bytes conditionId) view returns (bool isResolved, (uint256 yesWeight, uint256 noWeight) outcome)',
]);

/** The 4 picks a line implies, given the dealt cells and the declared mask. */
export function linePicks(
  line: Line,
  cells: readonly PoolCondition[],
  yesMask: number,
): Pick[] {
  return line.cellIndices.map((i) => ({
    conditionResolver: cells[i].resolver,
    conditionId: cells[i].conditionId,
    predictedOutcome: (yesMask & (1 << i)) !== 0 ? 1 : 0,
  }));
}

export function linePickConfigId(picks: Pick[]): Hex {
  return computePickConfigId(canonicalizePicks(picks)) as Hex;
}

/** A line counts as funded once the player holds predictor position tokens
 *  for its pick configuration. Idempotency for retries hangs off this. */
export async function lineFunded(
  player: Address,
  picks: Pick[],
): Promise<boolean> {
  if (!ESCROW_ADDRESS) throw new Error('Escrow not configured');
  const publicClient = getPublicClient();
  try {
    const pair = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_TOKENPAIR_ABI,
      functionName: 'getTokenPair',
      args: [linePickConfigId(picks)],
    })) as { predictorToken: Address; counterpartyToken: Address };
    if (
      !pair.predictorToken ||
      pair.predictorToken === '0x0000000000000000000000000000000000000000'
    ) {
      return false;
    }
    const bal = (await publicClient.readContract({
      address: pair.predictorToken,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [player],
    })) as bigint;
    return bal > 0n;
  } catch {
    // No token pair deployed yet → nothing minted for this config.
    return false;
  }
}

export type CellOutcome = 'pending' | 'yes' | 'no' | 'tie';

/** Decisive-or-pending view of a single condition, resolver reverts treated
 *  as pending (same fail-soft rule the old contract used). */
export async function cellResolution(
  resolver: Address,
  conditionId: Hex,
): Promise<CellOutcome> {
  const publicClient = getPublicClient();
  try {
    const [ok, outcome] = (await publicClient.readContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'getResolution',
      args: [conditionId],
    })) as readonly [boolean, { yesWeight: bigint; noWeight: bigint }];
    if (!ok) return 'pending';
    const { yesWeight, noWeight } = outcome;
    if (yesWeight > 0n && noWeight === 0n) return 'yes';
    if (noWeight > 0n && yesWeight === 0n) return 'no';
    if (yesWeight === 0n && noWeight === 0n) return 'pending';
    return 'tie';
  } catch {
    return 'pending';
  }
}
