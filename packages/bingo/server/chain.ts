// On-chain read helpers: which lines are funded, how cells resolved.
// Chain state is the ONLY source of truth — the server keeps no records.
// Every read is per network; the same code serves staging and main.

import { parseAbi, parseAbiItem, type Address, type Hex } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types/escrow';
import {
  predictionMarketEscrow as escrowAddresses,
  collateralToken as collateralAddresses,
  onboardingSponsor as sponsorAddresses,
} from '@sapience/sdk/contracts';
import { NETWORK_CONFIG, type Network } from './network.js';
import { chainFor, getPublicClient } from './session.js';
import { buildLines, type Line } from './lines.js';
import type { PoolCondition } from './types.js';

export function escrowAddress(network: Network): Address {
  const a = escrowAddresses[chainFor(network).id]?.address as
    | Address
    | undefined;
  if (!a) throw new Error(`Escrow not configured for ${network}`);
  return a;
}

export function collateralAddress(network: Network): Address {
  const a = collateralAddresses[chainFor(network).id]?.address as
    | Address
    | undefined;
  if (!a) throw new Error(`Collateral not configured for ${network}`);
  return a;
}

/** The OnboardingSponsor that funds sponsored predictor stakes — the SAME
 *  deployed instance /app uses (pinned to this escrow + the vault counterparty).
 *  Returns null if no instance is registered for the network. */
export function sponsorAddress(network: Network): Address | null {
  return (sponsorAddresses[chainFor(network).id]?.address as Address) ?? null;
}

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

const PREDICTION_CREATED_EVENT = parseAbiItem(
  'event PredictionCreated(bytes32 indexed predictionId, address indexed predictor, address indexed counterparty, address predictorToken, address counterpartyToken, uint256 predictorCollateral, uint256 counterpartyCollateral, bytes32 refCode, bytes32 pickConfigId)',
);

export interface FundedPrediction {
  pickConfigId: string;
  refCode: string;
  predictorCollateral: bigint;
}

/** Every prediction the player has EVER minted as predictor, from escrow
 *  events. Events can't be un-emitted, so this is the monotonic "line was
 *  funded" record — it survives the player redeeming (burning) the
 *  position. One getLogs call replaces what a journal would track. */
export async function fundedPredictions(
  network: Network,
  player: Address,
): Promise<FundedPrediction[]> {
  const logs = await getPublicClient(network).getLogs({
    address: escrowAddress(network),
    event: PREDICTION_CREATED_EVENT,
    args: { predictor: player },
    fromBlock: BigInt(NETWORK_CONFIG[network].logFromBlock),
    toBlock: 'latest',
  });
  const out: FundedPrediction[] = [];
  for (const log of logs) {
    const { pickConfigId, refCode, predictorCollateral } = log.args;
    if (!pickConfigId || !refCode || predictorCollateral == null) continue;
    out.push({
      pickConfigId: pickConfigId.toLowerCase(),
      refCode: refCode.toLowerCase(),
      predictorCollateral,
    });
  }
  return out;
}

/** True iff this exact line of this exact card was funded: pickConfigId +
 *  the card's refCode tag + the card's per-line stake must all match. The
 *  tag attributes the mint to one card (two cards can draw an identical
 *  line); the stake check stops a dust mint of a matching pickConfigId from
 *  counting as a funded line. */
export function lineIsFunded(
  funded: readonly FundedPrediction[],
  picks: Pick[],
  tag: Hex,
  stakePerLineWei: bigint,
): boolean {
  const pcid = linePickConfigId(picks).toLowerCase();
  const want = tag.toLowerCase();
  return funded.some(
    (f) =>
      f.pickConfigId === pcid &&
      f.refCode === want &&
      f.predictorCollateral === stakePerLineWei,
  );
}

/** Per-line funded flags for one card, in line order. */
export async function fundedLineFlags(
  network: Network,
  player: Address,
  cells: readonly PoolCondition[],
  yesMask: number,
  tag: Hex,
  stakePerLineWei: bigint,
): Promise<boolean[]> {
  const funded = await fundedPredictions(network, player);
  return buildLines().map((line) =>
    lineIsFunded(funded, linePicks(line, cells, yesMask), tag, stakePerLineWei),
  );
}

export type CellOutcome = 'pending' | 'yes' | 'no' | 'tie';

/** Decisive-or-pending view of a single condition, resolver reverts treated
 *  as pending (same fail-soft rule the old contract used). */
export async function cellResolution(
  network: Network,
  resolver: Address,
  conditionId: Hex,
): Promise<CellOutcome> {
  const publicClient = getPublicClient(network);
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
