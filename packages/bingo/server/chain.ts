// On-chain read helpers: which lines are funded, how cells resolved.
// Chain state is the ONLY source of truth — the server keeps no records.

import { parseAbi, parseAbiItem, type Address, type Hex } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types/escrow';
import {
  predictionMarketEscrow as escrowAddresses,
  collateralToken as collateralAddresses,
} from '@sapience/sdk/contracts';
import { env } from './config.js';
import { CHAIN_ID, getPublicClient } from './session.js';
import { buildLines, type Line } from './lines.js';
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
 *  for its pick configuration. Live-balance view — flips back to false if
 *  the player redeems (burns) the position; use `fundedPickConfigIds` for
 *  the monotonic record. */
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

const PREDICTION_CREATED_EVENT = parseAbiItem(
  'event PredictionCreated(bytes32 indexed predictionId, address indexed predictor, address indexed counterparty, address predictorToken, address counterpartyToken, uint256 predictorCollateral, uint256 counterpartyCollateral, bytes32 refCode, bytes32 pickConfigId)',
);

/** Every pickConfigId the player has EVER minted as predictor, from escrow
 *  events. Events can't be un-emitted, so this is the monotonic "line was
 *  funded" record — it survives the player redeeming (burning) the position.
 *  One getLogs call replaces what the journal used to track. */
export async function fundedPickConfigIds(
  player: Address,
): Promise<Set<string>> {
  if (!ESCROW_ADDRESS) throw new Error('Escrow not configured');
  const logs = await getPublicClient().getLogs({
    address: ESCROW_ADDRESS,
    event: PREDICTION_CREATED_EVENT,
    args: { predictor: player },
    fromBlock: BigInt(env.LOG_FROM_BLOCK),
    toBlock: 'latest',
  });
  const set = new Set<string>();
  for (const log of logs) {
    const id = log.args.pickConfigId;
    if (id) set.add(id.toLowerCase());
  }
  return set;
}

/** Per-line funded flags for a card, in line order. */
export async function fundedLineFlags(
  player: Address,
  cells: readonly PoolCondition[],
  yesMask: number,
): Promise<boolean[]> {
  const funded = await fundedPickConfigIds(player);
  return buildLines().map((line) =>
    funded.has(linePickConfigId(linePicks(line, cells, yesMask)).toLowerCase()),
  );
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
