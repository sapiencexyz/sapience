import {
  ContractFunctionExecutionError,
  erc20Abi,
  formatUnits,
  type Block,
} from 'viem';
import prisma from '../core/db';
import { SettlementResult } from '../../generated/prisma';
import {
  getProviderForChain,
  getBlockByTimestamp,
  resolveBlocksForTimestamps,
} from '../lib/utils';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

interface VaultPnLResult {
  realizedPnL: bigint;
  positionsWon: number;
  positionsLost: number;
  totalCollateralWon: bigint;
  totalCollateralLost: bigint;
}

interface VaultFlowsResult {
  totalDeposits: bigint;
  totalWithdrawals: bigint;
}

interface VaultSecondaryFlowsResult {
  bought: bigint;
  sold: bigint;
}

/**
 * Per-snapshot decomposition of every leg in 1634's reconciliation identity:
 *   balance + deployed = deposits − withdrawals + settlementPnL
 *                        + (secondarySold − secondaryBought) + airdrops
 *
 * Used only when PROTOCOL_STATS_GAP_DEBUG=1 to print full attribution logs so
 * a non-zero `Δ = LHS − RHS` can be traced to a specific leg (or to legacy
 * Prediction-side accounting that the new identity supersedes).
 */
export interface VaultGapDecomposition {
  // ── Prediction-side legs (legacy diagnostic; superseded by Close-based PnL) ──
  // Active deployment (in escrow, prediction not yet resolved as of t)
  counterpartyActiveStake: bigint;
  counterpartyActiveCount: number;
  predictorActiveStake: bigint;
  predictorActiveCount: number;
  // Resolved & vault-on-side wins (from Prediction)
  winsAsCounterpartyCount: number;
  winsAsCounterpartyGain: bigint;
  winsAsCounterpartyOwed: bigint;
  winsAsPredictorCount: number;
  winsAsPredictorGain: bigint;
  winsAsPredictorOwed: bigint;
  // Resolved & vault-on-side losses (from Prediction)
  lossesAsCounterpartyCount: number;
  lossesAsCounterpartyLoss: bigint;
  lossesAsPredictorCount: number;
  lossesAsPredictorLoss: bigint;
  // Claims (TokensRedeemed events filed by vault)
  claimedByVault: bigint;
  claimCount: number;
  // ── Close-based legs (load-bearing under 1634's identity) ──
  closesPredictorHolderCount: number;
  closesPredictorHolderPayout: bigint;
  closesCounterpartyHolderCount: number;
  closesCounterpartyHolderPayout: bigint;
  primaryCollateralCommitted: bigint;
  // CollateralTransfer leg (raw inflow source for airdrop residual)
  collateralTransfersIn: bigint;
  collateralTransfersInCount: number;
}

function formatGapDecomposition(
  label: string,
  d: VaultGapDecomposition,
  balance: bigint,
  deployed: bigint,
  deposits: bigint,
  withdrawals: bigint,
  pnl: bigint,
  secondary: VaultSecondaryFlowsResult,
  airdrops: bigint
): string {
  const fmt = (b: bigint): string => formatUnits(b, 18);
  const lhs = balance + deployed;
  const rhs =
    deposits - withdrawals + pnl + secondary.sold - secondary.bought + airdrops;
  const delta = lhs - rhs;
  const closeGross =
    d.closesPredictorHolderPayout + d.closesCounterpartyHolderPayout;
  const claimGross = d.claimedByVault;
  const unionGross = closeGross + claimGross;
  const totalOwedFromPredictionWins =
    d.winsAsCounterpartyOwed + d.winsAsPredictorOwed;
  const unredeemedFromPredictionView =
    totalOwedFromPredictionWins - d.claimedByVault > 0n
      ? totalOwedFromPredictionWins - d.claimedByVault
      : 0n;

  return [
    `[GapDebug] ${label}`,
    `  IDENTITY: balance + deployed = deposits − withdrawals + pnl + (sold − bought) + airdrops`,
    `  LHS = ${fmt(balance)} + ${fmt(deployed)} = ${fmt(lhs)}`,
    `  RHS = ${fmt(deposits)} − ${fmt(withdrawals)} + ${fmt(pnl)} + (${fmt(secondary.sold)} − ${fmt(secondary.bought)}) + ${fmt(airdrops)} = ${fmt(rhs)}`,
    `  Δ   = LHS − RHS = ${fmt(delta)}`,
    `  --- settlement gross payouts (Claim ∪ Close) ---`,
    `  Claim (TokensRedeemed): count=${d.claimCount}, payout=${fmt(claimGross)}`,
    `  Close (PositionsBurned, predictor-holder): count=${d.closesPredictorHolderCount}, payout=${fmt(d.closesPredictorHolderPayout)}`,
    `  Close (PositionsBurned, counterparty-holder): count=${d.closesCounterpartyHolderCount}, payout=${fmt(d.closesCounterpartyHolderPayout)}`,
    `  union gross payouts: ${fmt(unionGross)} (claim ${fmt(claimGross)} + close ${fmt(closeGross)})`,
    `  primary collateral committed (resolved preds): ${fmt(d.primaryCollateralCommitted)}`,
    `  realized PnL = union gross − primary = ${fmt(unionGross - d.primaryCollateralCommitted)}`,
    `  --- airdrop residual breakdown ---`,
    `  CollateralTransfer inflows: ${fmt(d.collateralTransfersIn)} (${d.collateralTransfersInCount} transfers)`,
    `  explained = deposits + union gross payouts + secondary.sold = ${fmt(deposits + unionGross + secondary.sold)}`,
    `  airdrop residual (clamped at 0) = ${fmt(airdrops)}`,
    `  --- legacy Prediction-side legs (informational) ---`,
    `  active stake: counterparty=${fmt(d.counterpartyActiveStake)} (${d.counterpartyActiveCount}), predictor=${fmt(d.predictorActiveStake)} (${d.predictorActiveCount})`,
    `  prediction-side wins (gain): as_cp=${fmt(d.winsAsCounterpartyGain)} (${d.winsAsCounterpartyCount}), as_pr=${fmt(d.winsAsPredictorGain)} (${d.winsAsPredictorCount})`,
    `  prediction-side losses: as_cp=${fmt(d.lossesAsCounterpartyLoss)} (${d.lossesAsCounterpartyCount}), as_pr=${fmt(d.lossesAsPredictorLoss)} (${d.lossesAsPredictorCount})`,
    `  claimed by vault (TokensRedeemed): ${fmt(d.claimedByVault)} (${d.claimCount} claims)`,
    `  unredeemed (Prediction-view): ${fmt(unredeemedFromPredictionView)}`,
  ].join('\n');
}

/**
 * Async live-path version: queries Prisma directly for one (chain, vault, timestamp)
 * tuple. Backfill uses the in-memory aggregator variant below to avoid N×scan.
 */
async function decomposeVaultGap(
  chainId: number,
  atTimestamp: number,
  vaultAddress: string
): Promise<VaultGapDecomposition> {
  const [predictions, claims, closes, transfers] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        chainId,
        OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
        onChainCreatedAt: { lte: atTimestamp },
      },
      select: {
        onChainCreatedAt: true,
        counterpartyCollateral: true,
        predictorCollateral: true,
        predictor: true,
        counterparty: true,
        pickConfigId: true,
        pickConfiguration: {
          select: { resolved: true, resolvedAt: true, result: true },
        },
      },
    }),
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        redeemedAt: { lte: atTimestamp },
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        burnedAt: { lte: atTimestamp },
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        burnedAt: true,
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
    prisma.collateralTransfer.findMany({
      where: {
        chainId,
        to: vaultAddress,
        timestamp: { lte: new Date(atTimestamp * 1000) },
      },
      select: { value: true },
    }),
  ]);

  return decomposeVaultGapInMemory(
    predictions,
    claims,
    closes,
    transfers,
    atTimestamp,
    vaultAddress
  );
}

interface DecompPrediction {
  onChainCreatedAt: number;
  counterpartyCollateral: string;
  predictorCollateral: string;
  predictor: string;
  counterparty: string;
  pickConfigId: string | null;
  pickConfiguration: {
    resolved: boolean;
    resolvedAt: number | null;
    result: SettlementResult;
  } | null;
}

interface DecompClaim {
  collateralPaid: string;
  holder?: string;
  redeemedAt?: number;
}

interface DecompClose {
  burnedAt: number;
  predictorHolder: string;
  counterpartyHolder: string;
  predictorPayout: string;
  counterpartyPayout: string;
}

interface DecompTransfer {
  to?: string;
  timestamp?: Date;
  value: string;
}

function decomposeVaultGapInMemory(
  predictions: DecompPrediction[],
  claims: DecompClaim[],
  closes: DecompClose[],
  transfers: DecompTransfer[],
  t: number,
  vaultAddress: string
): VaultGapDecomposition {
  const d: VaultGapDecomposition = {
    counterpartyActiveStake: 0n,
    counterpartyActiveCount: 0,
    predictorActiveStake: 0n,
    predictorActiveCount: 0,
    winsAsCounterpartyCount: 0,
    winsAsCounterpartyGain: 0n,
    winsAsCounterpartyOwed: 0n,
    winsAsPredictorCount: 0,
    winsAsPredictorGain: 0n,
    winsAsPredictorOwed: 0n,
    lossesAsCounterpartyCount: 0,
    lossesAsCounterpartyLoss: 0n,
    lossesAsPredictorCount: 0,
    lossesAsPredictorLoss: 0n,
    claimedByVault: 0n,
    claimCount: 0,
    closesPredictorHolderCount: 0,
    closesPredictorHolderPayout: 0n,
    closesCounterpartyHolderCount: 0,
    closesCounterpartyHolderPayout: 0n,
    primaryCollateralCommitted: 0n,
    collateralTransfersIn: 0n,
    collateralTransfersInCount: 0,
  };

  for (const p of predictions) {
    if (p.onChainCreatedAt > t) continue;
    const pc = p.pickConfiguration;
    const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
    const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
    if (!predictorIsVault && !counterpartyIsVault) continue;

    const predictorColl = BigInt(p.predictorCollateral);
    const counterpartyColl = BigInt(p.counterpartyCollateral);

    const stillActive =
      p.pickConfigId === null ||
      (pc != null &&
        (pc.resolved === false ||
          (pc.resolved === true &&
            pc.resolvedAt !== null &&
            pc.resolvedAt > t)));

    if (stillActive) {
      if (counterpartyIsVault) {
        d.counterpartyActiveStake += counterpartyColl;
        d.counterpartyActiveCount++;
      }
      if (predictorIsVault) {
        d.predictorActiveStake += predictorColl;
        d.predictorActiveCount++;
      }
      continue;
    }

    if (
      !pc ||
      !pc.resolved ||
      pc.result === SettlementResult.UNRESOLVED ||
      pc.resolvedAt === null ||
      pc.resolvedAt > t
    ) {
      continue;
    }

    // Resolved prediction: contributes to primary collateral committed.
    if (predictorIsVault) d.primaryCollateralCommitted += predictorColl;
    if (counterpartyIsVault) d.primaryCollateralCommitted += counterpartyColl;

    const vaultWon =
      (predictorIsVault && pc.result === SettlementResult.PREDICTOR_WINS) ||
      (counterpartyIsVault && pc.result === SettlementResult.COUNTERPARTY_WINS);

    if (vaultWon) {
      const gain = predictorIsVault ? counterpartyColl : predictorColl;
      const owed = predictorColl + counterpartyColl;
      if (predictorIsVault) {
        d.winsAsPredictorCount++;
        d.winsAsPredictorGain += gain;
        d.winsAsPredictorOwed += owed;
      } else {
        d.winsAsCounterpartyCount++;
        d.winsAsCounterpartyGain += gain;
        d.winsAsCounterpartyOwed += owed;
      }
    } else {
      const loss = predictorIsVault ? predictorColl : counterpartyColl;
      if (predictorIsVault) {
        d.lossesAsPredictorCount++;
        d.lossesAsPredictorLoss += loss;
      } else {
        d.lossesAsCounterpartyCount++;
        d.lossesAsCounterpartyLoss += loss;
      }
    }
  }

  for (const c of claims) {
    if (c.holder !== undefined && c.holder.toLowerCase() !== vaultAddress)
      continue;
    if (c.redeemedAt !== undefined && c.redeemedAt > t) continue;
    d.claimedByVault += BigInt(c.collateralPaid);
    d.claimCount++;
  }

  for (const c of closes) {
    if (c.burnedAt > t) continue;
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      d.closesPredictorHolderCount++;
      d.closesPredictorHolderPayout += BigInt(c.predictorPayout);
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      d.closesCounterpartyHolderCount++;
      d.closesCounterpartyHolderPayout += BigInt(c.counterpartyPayout);
    }
  }

  for (const tr of transfers) {
    if (tr.to !== undefined && tr.to.toLowerCase() !== vaultAddress) continue;
    if (
      tr.timestamp !== undefined &&
      Math.floor(tr.timestamp.getTime() / 1000) > t
    ) {
      continue;
    }
    d.collateralTransfersIn += BigInt(tr.value);
    d.collateralTransfersInCount++;
  }

  return d;
}

const GAP_DEBUG = (): boolean => process.env.PROTOCOL_STATS_GAP_DEBUG === '1';

function emptyDecomposition(): VaultGapDecomposition {
  return {
    counterpartyActiveStake: 0n,
    counterpartyActiveCount: 0,
    predictorActiveStake: 0n,
    predictorActiveCount: 0,
    winsAsCounterpartyCount: 0,
    winsAsCounterpartyGain: 0n,
    winsAsCounterpartyOwed: 0n,
    winsAsPredictorCount: 0,
    winsAsPredictorGain: 0n,
    winsAsPredictorOwed: 0n,
    lossesAsCounterpartyCount: 0,
    lossesAsCounterpartyLoss: 0n,
    lossesAsPredictorCount: 0,
    lossesAsPredictorLoss: 0n,
    claimedByVault: 0n,
    claimCount: 0,
    closesPredictorHolderCount: 0,
    closesPredictorHolderPayout: 0n,
    closesCounterpartyHolderCount: 0,
    closesCounterpartyHolderPayout: 0n,
    primaryCollateralCommitted: 0n,
    collateralTransfersIn: 0n,
    collateralTransfersInCount: 0,
  };
}

interface ProtocolStatsData {
  vaultBalance: bigint;
  vaultAvailableAssets: bigint;
  vaultDeployed: bigint;
  escrowBalance: bigint;
  vaultRealizedPnL: bigint;
  vaultAirdropGains: bigint;
  vaultSecondaryBought: bigint;
  vaultSecondarySold: bigint;
  vaultDeposits: bigint;
  vaultWithdrawals: bigint;
  vaultPositionsWon: number;
  vaultPositionsLost: number;
  vaultCollateralWon: bigint;
  vaultCollateralLost: bigint;
  /**
   * wUSDe earmarked for the vault from resolved wins it hasn't yet redeemed
   * (Prediction-based attribution; legacy diagnostic, not used by the
   * settlement-PnL identity which now flows from Close.predictorHolder /
   * Close.counterpartyHolder).
   */
  vaultUnredeemedClaim: bigint;
}

type VaultConfig = (typeof contracts.predictionMarketVault)[number];

export interface ConfiguredVault {
  kind: 'protocol' | 'pyth' | 'single-leg' | 'strategy-b';
  config: VaultConfig;
  address: string; // lowercased
}

/**
 * Return every vault deployed on the given chain. Used to fan-out per-vault
 * snapshot computation. The cron + backfill iterate this list, so adding a new
 * vault family means: declare it in @sapience/sdk/contracts, then add a block
 * here. No other code change required for the indexer to pick it up.
 */
export function getConfiguredVaults(chainId: number): ConfiguredVault[] {
  const list: ConfiguredVault[] = [];
  const protocol = contracts.predictionMarketVault[chainId];
  if (protocol) {
    list.push({
      kind: 'protocol',
      config: protocol,
      address: protocol.address.toLowerCase(),
    });
  }
  const pyth = contracts.pythPredictionMarketVault[chainId];
  if (pyth) {
    list.push({
      kind: 'pyth',
      config: pyth,
      address: pyth.address.toLowerCase(),
    });
  }
  const singleLeg = contracts.singleLegVault[chainId];
  if (singleLeg) {
    list.push({
      kind: 'single-leg',
      config: singleLeg,
      address: singleLeg.address.toLowerCase(),
    });
  }
  const strategyB = contracts.predictionMarketVaultStrategyB[chainId];
  if (strategyB) {
    list.push({
      kind: 'strategy-b',
      config: strategyB,
      address: strategyB.address.toLowerCase(),
    });
  }
  return list;
}

/**
 * Return every deployed vault address known to the SDK config, including legacy
 * deployments. Historical backfills need the full address set because DB rows
 * were written against the address that existed at the time, while the live
 * cron path normally only touches current primaries from `getConfiguredVaults`.
 */
export function getConfiguredVaultDeploymentAddresses(
  chainId: number
): string[] {
  const addresses = new Set<string>();
  for (const vault of getConfiguredVaults(chainId)) {
    addresses.add(vault.address);
    for (const legacy of vault.config.legacy ?? []) {
      addresses.add(normalizeLegacyEntry(legacy).address.toLowerCase());
    }
  }
  return [...addresses];
}

/**
 * Resolve a vault address override (or default to the protocol primary) and
 * return it lowercased, ready for prisma string-equality comparisons.
 */
function resolveVaultAddress(
  chainId: number,
  vaultAddressArg?: string
): string | undefined {
  const raw =
    vaultAddressArg ?? contracts.predictionMarketVault[chainId]?.address;
  return raw?.toLowerCase();
}

/**
 * Fetch Vault balance: collateral.balanceOf(vault)
 */
export async function fetchVaultTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress as `0x${string}`],
  });

  return balance;
}

/**
 * Fetch vault collateral locked in the escrow: sum of counterpartyCollateral
 * for predictions that were active at `atTimestamp` (or currently active if omitted)
 * where the vault is the counterparty.
 *
 * Uses Picks.resolved / Picks.resolvedAt instead of Prediction.settled / settledAt
 * because losing predictions may never get settled on-chain.
 */
export async function fetchVaultDeployed(
  chainId: number = DEFAULT_CHAIN_ID,
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress,
      ...(atTimestamp
        ? {
            onChainCreatedAt: { lte: atTimestamp },
            OR: [
              // No pick config linked — treat as active
              { pickConfigId: null },
              // Pick config not yet resolved
              { pickConfiguration: { resolved: false } },
              // Pick config resolved after the queried timestamp
              {
                pickConfiguration: {
                  resolved: true,
                  resolvedAt: { gt: atTimestamp },
                },
              },
            ],
          }
        : {
            OR: [
              { pickConfigId: null },
              { pickConfiguration: { resolved: false } },
            ],
          }),
    },
    select: { counterpartyCollateral: true },
  });

  let total = 0n;
  for (const p of predictions) {
    total += BigInt(p.counterpartyCollateral);
  }
  return total;
}

/**
 * Fetch vault collateral locked in the escrow at a specific point in time.
 */
export async function fetchVaultDeployedAtBlock(
  chainId: number,
  _blockNumber: bigint,
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  return fetchVaultDeployed(chainId, atTimestamp, vaultAddressArg);
}

/**
 * Fetch Vault available assets: vault.availableAssets()
 */
export async function fetchVaultAvailableAssets(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Vault available assets at a specific block number.
 */
export async function fetchVaultAvailableAssetsAtBlock(
  chainId: number,
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
    blockNumber,
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Escrow TVL: collateral.balanceOf(predictionMarketEscrow)
 */
export async function fetchPredictionMarketEscrowTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  escrowAddressOverride?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress =
    escrowAddressOverride || contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress as `0x${string}`],
  });

  return balance;
}

/**
 * Fetch Vault balance at a specific block number (for historical queries).
 */
export async function fetchVaultTVLAtBlock(
  chainId: number,
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress as `0x${string}`],
    blockNumber,
  });

  return balance;
}

/**
 * Fetch Escrow TVL at a specific block number (for historical queries).
 */
export async function fetchPredictionMarketTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress = contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress],
    blockNumber,
  });

  return balance;
}

/**
 * Find the correct contract address for a given block number by checking
 * blockCreated timestamps. Returns the contract that was deployed at or before
 * the given block, preferring newer deployments.
 *
 * Order: current contract first, then legacy entries in array order.
 * Each entry's blockCreated indicates when it was deployed — if the target
 * block is before that, skip to the next (older) contract.
 */
function getContractForBlock(
  contractConfig: (typeof contracts.predictionMarketVault)[number],
  blockNumber: bigint
): `0x${string}` | null {
  const currentBlock = contractConfig.blockCreated ?? 0;
  if (blockNumber >= BigInt(currentBlock)) {
    return contractConfig.address as `0x${string}`;
  }

  for (const legEntry of contractConfig.legacy ?? []) {
    const entry = normalizeLegacyEntry(legEntry);
    if (blockNumber >= BigInt(entry.blockCreated)) {
      return entry.address as `0x${string}`;
    }
  }

  return null;
}

/**
 * Sum the collateral balance across the current V2 escrow + every past V2 escrow
 * deployment. Iterates over the deduped list of [primary, ...legacies] from the
 * SDK config — avoids double-counting when `getContractForBlock` would return a
 * legacy (pre-redeploy blocks) and we'd otherwise re-read it from the legacy
 * loop. For blocks where a contract wasn't deployed yet, `balanceOf` returns 0
 * (the token's storage slot is simply empty for that address), so earlier
 * blocks just get a smaller total.
 *
 * `blockNumber` pins reads to a historical block; omit it (or pass `undefined`)
 * to read at chain head — used by the resolver's live-candle branch.
 */
export async function sumEscrowBalancesAtBlock(
  client: ReturnType<typeof getProviderForChain>,
  chainId: number,
  blockNumber?: bigint
): Promise<bigint> {
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;
  if (!escrowConfig || !collateralAddress) return 0n;

  const addrs = new Set<`0x${string}`>([escrowConfig.address as `0x${string}`]);
  for (const le of escrowConfig.legacy ?? []) {
    addrs.add(normalizeLegacyEntry(le).address as `0x${string}`);
  }

  // Reads are independent — fan out in parallel. Each per-address try/catch
  // ONLY swallows revert-like errors (balanceOf can revert when the contract
  // didn't exist at the queried block); network/timeout/rate-limit errors
  // (transport-level retries already exhausted) propagate so callers fail
  // loud rather than silently writing a "0 balance" snapshot.
  const balances = await Promise.all(
    [...addrs].map(async (addr) => {
      try {
        return await client.readContract({
          address: collateralAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [addr],
          ...(blockNumber !== undefined ? { blockNumber } : {}),
        });
      } catch (err) {
        if (err instanceof ContractFunctionExecutionError) return 0n;
        throw err;
      }
    })
  );
  return balances.reduce((acc, v) => acc + v, 0n);
}

/**
 * Calculate vault's realized PnL from resolved predictions.
 *
 * Uses Picks.resolved (set automatically when all conditions settle)
 * rather than Prediction.settled (requires an explicit on-chain settle() call
 * that may never happen for losing predictions).
 */
export async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultPnLResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) {
    return {
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    };
  }

  // Gross payouts: actual wUSDe the vault received from settlement-related
  // wUSDe transfers. The protocol has two disjoint payout mechanisms — we
  // sum both because each transfers wUSDe to the holder via on-chain
  // safeTransfer:
  //
  //   1. `redeem()`  → TokensRedeemed → Claim (post-resolution, per-holder).
  //      Holder calls; gets their proportional payout from the resolved
  //      pickConfig pool.
  //   2. `burn()`    → PositionsBurned → Close (bilateral pre/post-resolution
  //      exit). Both sides burn together; payouts go to predictorHolder AND
  //      counterpartyHolder in the same tx.
  //
  // Using ONLY Close (1634) would miss per-holder redemptions; ONLY Claim
  // would miss bilateral-burn payouts. Both can land in the vault when it's
  // a holder of either side.
  const [claims, closes] = await Promise.all([
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
  ]);

  let grossPayouts = 0n;
  let totalCollateralWon = 0n;
  let positionsWon = 0;
  for (const c of claims) {
    const payout = BigInt(c.collateralPaid);
    grossPayouts += payout;
    totalCollateralWon += payout;
    positionsWon++;
  }
  for (const c of closes) {
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      const payout = BigInt(c.predictorPayout);
      grossPayouts += payout;
      totalCollateralWon += payout;
      if (payout > 0n) positionsWon++;
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      const payout = BigInt(c.counterpartyPayout);
      grossPayouts += payout;
      totalCollateralWon += payout;
      if (payout > 0n) positionsWon++;
    }
  }

  // Cost basis: primary-creation collateral the vault committed for
  // predictions whose pickConfig has now resolved. Sold-on-secondary
  // positions still count here — the cost was paid at creation, and the
  // sale proceeds are tracked separately in vaultSecondarySold. We use
  // Prediction (creator-side attribution) deliberately: PnL relative to
  // *vault's* economic exposure is `wUSDe in − wUSDe out`, where in =
  // claims for vault and out = primary collateral vault committed.
  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      pickConfigId: { not: null },
      pickConfiguration: {
        resolved: true,
        result: { not: SettlementResult.UNRESOLVED },
        ...(beforeTimestamp ? { resolvedAt: { lte: beforeTimestamp } } : {}),
      },
      OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
    },
    include: {
      pickConfiguration: { select: { result: true } },
    },
  });

  let primaryCollateral = 0n;
  let positionsLost = 0;
  for (const p of predictions) {
    const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
    const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
    if (predictorIsVault) {
      primaryCollateral += BigInt(p.predictorCollateral);
    }
    if (counterpartyIsVault) {
      primaryCollateral += BigInt(p.counterpartyCollateral);
    }
    const pc = p.pickConfiguration;
    if (!pc) continue;
    const vaultLost =
      (predictorIsVault && pc.result === SettlementResult.COUNTERPARTY_WINS) ||
      (counterpartyIsVault && pc.result === SettlementResult.PREDICTOR_WINS);
    if (vaultLost) positionsLost++;
  }

  return {
    realizedPnL: grossPayouts - primaryCollateral,
    positionsWon,
    positionsLost,
    totalCollateralWon,
    totalCollateralLost: primaryCollateral,
  };
}

/**
 * Calculate vault's cumulative secondary-market trade flow.
 *
 * Sums total wUSDe paid (`bought`) and received (`sold`) by the vault on
 * the secondary market up through `beforeTimestamp` (exclusive of later
 * trades when supplied). These are gross cash movements; PnL realized
 * from secondary trades is `sold − bought` netted against any cost basis
 * still represented inside `realizedPnL`.
 */
export async function calculateVaultSecondaryFlows(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultSecondaryFlowsResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return { bought: 0n, sold: 0n };

  const trades = await prisma.secondaryTrade.findMany({
    where: {
      chainId,
      ...(beforeTimestamp ? { executedAt: { lte: beforeTimestamp } } : {}),
      OR: [{ buyer: vaultAddress }, { seller: vaultAddress }],
    },
    select: { buyer: true, seller: true, price: true },
  });

  let bought = 0n;
  let sold = 0n;
  for (const t of trades) {
    if (t.buyer.toLowerCase() === vaultAddress) bought += BigInt(t.price);
    if (t.seller.toLowerCase() === vaultAddress) sold += BigInt(t.price);
  }
  return { bought, sold };
}

/**
 * Calculate vault's airdrop gains: wUSDe transferred into the vault from
 * sources the protocol doesn't otherwise track.
 *
 *   airdrop = sum(CollateralTransfer.value where to = vault)
 *           − sum(VaultFlowEvent deposits)
 *           − sum(Close payouts to vault holder)
 *           − sum(SecondaryTrade.price where seller = vault)
 *
 * In a fully-reconciled state this is zero unless real wUSDe arrives via
 * a path outside the protocol (sapience emissions, partner rewards, etc).
 * Clamped at zero — a negative residual indicates an indexer gap and is
 * surfaced via the snapshot console log rather than corrupting the chart.
 */
export async function calculateVaultAirdrops(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const transferWhere: {
    chainId: number;
    to: string;
    timestamp?: { lte: Date };
  } = {
    chainId,
    to: vaultAddress,
  };
  if (beforeTimestamp) {
    transferWhere.timestamp = { lte: new Date(beforeTimestamp * 1000) };
  }

  const transfers = await prisma.collateralTransfer.findMany({
    where: transferWhere,
    select: { value: true },
  });
  let transfersIn = 0n;
  for (const t of transfers) transfersIn += BigInt(t.value);

  const flows = await calculateVaultFlows(
    chainId,
    beforeTimestamp,
    vaultAddressArg
  );

  // Settlement inflow: union of Claim (per-holder redeem) and Close
  // (bilateral burn). Mirrors `calculateVaultPnL` — both transfer wUSDe to
  // the vault when it holds a side, and they are disjoint event-streams.
  const [claims, closes] = await Promise.all([
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
  ]);
  let settlementInflow = 0n;
  for (const c of claims) settlementInflow += BigInt(c.collateralPaid);
  for (const c of closes) {
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      settlementInflow += BigInt(c.predictorPayout);
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      settlementInflow += BigInt(c.counterpartyPayout);
    }
  }

  const secondary = await calculateVaultSecondaryFlows(
    chainId,
    beforeTimestamp,
    vaultAddressArg
  );

  const explained = flows.totalDeposits + settlementInflow + secondary.sold;
  return transfersIn > explained ? transfersIn - explained : 0n;
}

/**
 * Calculate a vault's cumulative deposits and withdrawals from indexed flow
 * events. Events are scoped per-vault via the `vaultAddress` column added in
 * 20260422_add_vault_address_to_vault_flow_event — that migration TRUNCATEs
 * the table, so by the time this code runs every row has a non-null vaultAddress.
 */
export async function calculateVaultFlows(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultFlowsResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return { totalDeposits: 0n, totalWithdrawals: 0n };

  const whereClause: {
    chainId: number;
    vaultAddress: string;
    timestamp?: { lte: number };
  } = { chainId, vaultAddress };

  if (beforeTimestamp) {
    whereClause.timestamp = { lte: beforeTimestamp };
  }

  const events = await prisma.vaultFlowEvent.findMany({ where: whereClause });

  let totalDeposits = 0n;
  let totalWithdrawals = 0n;

  for (const event of events) {
    const assets = BigInt(event.assets);
    if (event.eventType === 'deposit') {
      totalDeposits += assets;
    } else {
      totalWithdrawals += assets;
    }
  }

  return { totalDeposits, totalWithdrawals };
}

/**
 * Calculate the wUSDe earmarked for the vault from resolved-but-not-yet-redeemed
 * wins. Bridges the basis mismatch between accrual `vaultRealizedPnL` (booked at
 * `Picks.resolvedAt`) and cash-basis `vaultBalance` (only after `redeem()`).
 *
 *   unredeemed = Σ (predictorCollateral + counterpartyCollateral) for predictions
 *                where the vault is on the winning side AND Picks.resolvedAt ≤ t
 *              − Σ Claim.collateralPaid where holder = vault, redeemedAt ≤ t
 *
 * The per-prediction claimable on the winning side equals total collateral by
 * the contract's parimutuel rule (see `_calculateClaimableForPrediction` in
 * PredictionMarketEscrow.sol — `counterpartyClaimable = totalCollateral` on
 * COUNTERPARTY_WINS, `predictorClaimable = totalCollateral` on PREDICTOR_WINS).
 *
 * Why not filter on `Prediction.settled`: that flag flips when SOMEONE calls
 * `settle(predictionId)` on-chain — which is independent admin metadata and
 * doesn't gate redemption. As long as the parent pickConfig is resolved
 * (Picks.resolved = true, which is what gates `redeem()` on-chain), the vault's
 * counterparty stake AND prize are sitting in escrow earmarked for it.
 *
 * Clamped at 0n. The `Claim.predictionId` column actually stores the on-chain
 * pickConfigId (known indexer misnomer); we don't join through it — we just sum
 * Claim rows whose holder is the vault.
 */
export async function calculateVaultUnredeemedClaim(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const resolvedFilter = beforeTimestamp ? { lte: beforeTimestamp } : undefined;

  const [counterpartyWins, predictorWins, claims] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        chainId,
        counterparty: vaultAddress,
        pickConfiguration: {
          resolved: true,
          result: SettlementResult.COUNTERPARTY_WINS,
          ...(resolvedFilter ? { resolvedAt: resolvedFilter } : {}),
        },
      },
      select: { predictorCollateral: true, counterpartyCollateral: true },
    }),
    prisma.prediction.findMany({
      where: {
        chainId,
        predictor: vaultAddress,
        pickConfiguration: {
          resolved: true,
          result: SettlementResult.PREDICTOR_WINS,
          ...(resolvedFilter ? { resolvedAt: resolvedFilter } : {}),
        },
      },
      select: { predictorCollateral: true, counterpartyCollateral: true },
    }),
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
  ]);

  let owed = 0n;
  for (const p of counterpartyWins) {
    owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
  }
  for (const p of predictorWins) {
    owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
  }

  let claimed = 0n;
  for (const c of claims) claimed += BigInt(c.collateralPaid);

  const remainder = owed - claimed;
  return remainder > 0n ? remainder : 0n;
}

/**
 * Synchronous, in-memory replacements for `fetchVaultDeployed`,
 * `calculateVaultPnL`, and `calculateVaultFlows`. The backfill loop calls all
 * three per snapshot; doing each as a `findMany` round-trip causes N×table_scan
 * amplification (e.g. 541 snapshots × full prediction-table scan). The
 * underlying tables don't change during a backfill, so we pre-fetch the
 * superset once and aggregate in JS for each timestamp.
 *
 * Multi-vault: a single prefetch over every configured vault on the chain is
 * cheaper than one prefetch per vault. The closures take `vaultAddressLower`
 * as a per-call argument and filter the in-memory superset.
 *
 * The cron path + GraphQL resolver still call the original async helpers —
 * those run once per request, so this micro-optimization isn't worth the
 * complexity there.
 */
export interface VaultAggregator {
  deployedAt: (timestamp: number, vaultAddressLower: string) => bigint;
  pnlAt: (timestamp: number, vaultAddressLower: string) => VaultPnLResult;
  flowsAt: (timestamp: number, vaultAddressLower: string) => VaultFlowsResult;
  unredeemedClaimAt: (timestamp: number, vaultAddressLower: string) => bigint;
  secondaryAt: (
    timestamp: number,
    vaultAddressLower: string
  ) => VaultSecondaryFlowsResult;
  airdropsAt: (timestamp: number, vaultAddressLower: string) => bigint;
  gapDecompositionAt: (
    timestamp: number,
    vaultAddressLower: string
  ) => VaultGapDecomposition;
}

export async function buildVaultAggregator(
  chainId: number
): Promise<VaultAggregator> {
  const vaultAddresses = getConfiguredVaultDeploymentAddresses(chainId);
  if (vaultAddresses.length === 0) {
    return {
      deployedAt: () => 0n,
      pnlAt: () => ({
        realizedPnL: 0n,
        positionsWon: 0,
        positionsLost: 0,
        totalCollateralWon: 0n,
        totalCollateralLost: 0n,
      }),
      flowsAt: () => ({ totalDeposits: 0n, totalWithdrawals: 0n }),
      unredeemedClaimAt: () => 0n,
      secondaryAt: () => ({ bought: 0n, sold: 0n }),
      airdropsAt: () => 0n,
      gapDecompositionAt: () => emptyDecomposition(),
    };
  }

  // Fetch the union of every prediction either the deployed-collateral
  // aggregator or the PnL aggregator could possibly need across all configured
  // vaults: anything where any configured vault is on either side of the trade.
  // `vaultFlowEvent` is similarly chain-scoped — `vaultAddress` is set on every
  // row by the backfill script (the migration TRUNCATEd legacy rows).
  // `claim` rows are filtered by `holder ∈ vaultAddresses` for the
  // unredeemed-claim aggregator (one Claim row per on-chain `redeem()` call).
  const [predictions, flows, claims, closes, trades, transfers] =
    await Promise.all([
      prisma.prediction.findMany({
        where: {
          chainId,
          OR: [
            { predictor: { in: vaultAddresses } },
            { counterparty: { in: vaultAddresses } },
          ],
        },
        select: {
          onChainCreatedAt: true,
          counterpartyCollateral: true,
          predictorCollateral: true,
          predictor: true,
          counterparty: true,
          pickConfigId: true,
          pickConfiguration: {
            select: { resolved: true, resolvedAt: true, result: true },
          },
        },
      }),
      prisma.vaultFlowEvent.findMany({
        where: { chainId },
        select: {
          timestamp: true,
          eventType: true,
          assets: true,
          vaultAddress: true,
        },
      }),
      prisma.claim.findMany({
        where: { chainId, holder: { in: vaultAddresses } },
        select: { holder: true, collateralPaid: true, redeemedAt: true },
      }),
      prisma.close.findMany({
        where: {
          chainId,
          OR: [
            { predictorHolder: { in: vaultAddresses } },
            { counterpartyHolder: { in: vaultAddresses } },
          ],
        },
        select: {
          burnedAt: true,
          predictorHolder: true,
          counterpartyHolder: true,
          predictorPayout: true,
          counterpartyPayout: true,
        },
      }),
      prisma.secondaryTrade.findMany({
        where: {
          chainId,
          OR: [
            { buyer: { in: vaultAddresses } },
            { seller: { in: vaultAddresses } },
          ],
        },
        select: { executedAt: true, buyer: true, seller: true, price: true },
      }),
      prisma.collateralTransfer.findMany({
        where: { chainId, to: { in: vaultAddresses } },
        select: { to: true, timestamp: true, value: true },
      }),
    ]);

  // Predicate ports of the SQL filters in `fetchVaultDeployed` /
  // `calculateVaultPnL` / `calculateVaultFlows`. Keep these inline so a future
  // reader can audit the JS branches against the SQL directly.
  const deployedAt = (t: number, vaultAddress: string): bigint => {
    let total = 0n;
    for (const p of predictions) {
      if (p.counterparty.toLowerCase() !== vaultAddress) continue;
      if (p.onChainCreatedAt > t) continue;
      const pc = p.pickConfiguration;
      const stillDeployed =
        p.pickConfigId === null ||
        (pc != null &&
          (pc.resolved === false ||
            (pc.resolved === true &&
              pc.resolvedAt !== null &&
              pc.resolvedAt > t)));
      if (stillDeployed) total += BigInt(p.counterpartyCollateral);
    }
    return total;
  };

  // Settlement PnL: gross payouts = Claim (TokensRedeemed) ∪ Close
  // (PositionsBurned), the two disjoint mechanisms by which the contract
  // can transfer wUSDe to a vault that holds a side. See
  // `calculateVaultPnL` for the why.
  const pnlAt = (t: number, vaultAddress: string): VaultPnLResult => {
    let grossPayouts = 0n;
    let positionsWon = 0;
    let totalCollateralWon = 0n;

    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      const payout = BigInt(c.collateralPaid);
      grossPayouts += payout;
      totalCollateralWon += payout;
      positionsWon++;
    }
    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        const payout = BigInt(c.predictorPayout);
        grossPayouts += payout;
        totalCollateralWon += payout;
        if (payout > 0n) positionsWon++;
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        const payout = BigInt(c.counterpartyPayout);
        grossPayouts += payout;
        totalCollateralWon += payout;
        if (payout > 0n) positionsWon++;
      }
    }

    let primaryCollateral = 0n;
    let positionsLost = 0;
    for (const p of predictions) {
      if (p.pickConfigId === null) continue;
      const pc = p.pickConfiguration;
      if (!pc || !pc.resolved) continue;
      if (pc.result === SettlementResult.UNRESOLVED) continue;
      if (pc.resolvedAt === null || pc.resolvedAt > t) continue;

      const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
      const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
      if (predictorIsVault) {
        primaryCollateral += BigInt(p.predictorCollateral);
      }
      if (counterpartyIsVault) {
        primaryCollateral += BigInt(p.counterpartyCollateral);
      }
      const vaultLost =
        (predictorIsVault &&
          pc.result === SettlementResult.COUNTERPARTY_WINS) ||
        (counterpartyIsVault && pc.result === SettlementResult.PREDICTOR_WINS);
      if (vaultLost) positionsLost++;
    }

    return {
      realizedPnL: grossPayouts - primaryCollateral,
      positionsWon,
      positionsLost,
      totalCollateralWon,
      totalCollateralLost: primaryCollateral,
    };
  };

  const secondaryAt = (
    t: number,
    vaultAddress: string
  ): VaultSecondaryFlowsResult => {
    let bought = 0n;
    let sold = 0n;
    for (const tr of trades) {
      if (tr.executedAt > t) continue;
      if (tr.buyer.toLowerCase() === vaultAddress) bought += BigInt(tr.price);
      if (tr.seller.toLowerCase() === vaultAddress) sold += BigInt(tr.price);
    }
    return { bought, sold };
  };

  // Airdrops: total wUSDe transfers in to vault, minus inflows already
  // accounted for via deposits, settlement payouts, and secondary sales.
  // Mirrors the async `calculateVaultAirdrops` definition.
  const airdropsAt = (t: number, vaultAddress: string): bigint => {
    let transfersIn = 0n;
    for (const tr of transfers) {
      if (tr.to.toLowerCase() !== vaultAddress) continue;
      if (Math.floor(tr.timestamp.getTime() / 1000) > t) continue;
      transfersIn += BigInt(tr.value);
    }

    // Settlement inflow: union of Claim (per-holder redeem) and Close
    // (bilateral burn). Mirrors `calculateVaultAirdrops`.
    let settlementInflow = 0n;
    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      settlementInflow += BigInt(c.collateralPaid);
    }
    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.predictorPayout);
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.counterpartyPayout);
      }
    }

    const flowsRes = flowsAt(t, vaultAddress);
    const secondary = secondaryAt(t, vaultAddress);
    const explained =
      flowsRes.totalDeposits + settlementInflow + secondary.sold;
    return transfersIn > explained ? transfersIn - explained : 0n;
  };

  const flowsAt = (t: number, vaultAddress: string): VaultFlowsResult => {
    let totalDeposits = 0n;
    let totalWithdrawals = 0n;
    for (const e of flows) {
      if (e.vaultAddress.toLowerCase() !== vaultAddress) continue;
      if (e.timestamp > t) continue;
      const assets = BigInt(e.assets);
      if (e.eventType === 'deposit') totalDeposits += assets;
      else totalWithdrawals += assets;
    }
    return { totalDeposits, totalWithdrawals };
  };

  // unredeemedClaim — sum of per-prediction claimable amounts (= total
  // collateral on the winning side, per the contract's parimutuel rule) for
  // vault wins resolved by `t`, minus claims by vault redeemed by `t`. Mirrors
  // `calculateVaultUnredeemedClaim` and reads from the prefetched arrays.
  //
  // We deliberately do NOT filter on `Prediction.settled`: that flag is admin
  // metadata about who called settle(), and the wUSDe is sitting in escrow
  // earmarked for the vault as soon as the parent pickConfig is resolved
  // regardless of which sibling triggered the on-chain resolution.
  const unredeemedClaimAt = (t: number, vaultAddress: string): bigint => {
    let owed = 0n;
    for (const p of predictions) {
      const pc = p.pickConfiguration;
      if (!pc || !pc.resolved) continue;
      if (pc.resolvedAt === null || pc.resolvedAt > t) continue;
      const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
      const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
      if (
        counterpartyIsVault &&
        pc.result === SettlementResult.COUNTERPARTY_WINS
      ) {
        owed +=
          BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
      } else if (
        predictorIsVault &&
        pc.result === SettlementResult.PREDICTOR_WINS
      ) {
        owed +=
          BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
      }
    }
    let claimed = 0n;
    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      claimed += BigInt(c.collateralPaid);
    }
    const remainder = owed - claimed;
    return remainder > 0n ? remainder : 0n;
  };

  const gapDecompositionAt = (
    t: number,
    vaultAddress: string
  ): VaultGapDecomposition =>
    decomposeVaultGapInMemory(
      predictions,
      claims,
      closes,
      transfers,
      t,
      vaultAddress
    );

  return {
    deployedAt,
    pnlAt,
    flowsAt,
    unredeemedClaimAt,
    secondaryAt,
    airdropsAt,
    gapDecompositionAt,
  };
}

/**
 * Get UTC midnight timestamp for a given date.
 */
function getUtcMidnightTimestamp(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      1000
  );
}

/**
 * Create or update stats snapshot with all data.
 */
async function upsertProtocolStatsSnapshot(
  timestamp: number,
  chainId: number,
  vaultAddress: string,
  data: ProtocolStatsData
): Promise<void> {
  await prisma.protocolStatsSnapshot.upsert({
    where: {
      chainId_vaultAddress_timestamp: { chainId, vaultAddress, timestamp },
    },
    create: {
      timestamp,
      chainId,
      vaultAddress,
      vaultBalance: data.vaultBalance.toString(),
      vaultAvailableAssets: data.vaultAvailableAssets.toString(),
      vaultDeployed: data.vaultDeployed.toString(),
      escrowBalance: data.escrowBalance.toString(),
      vaultRealizedPnL: data.vaultRealizedPnL.toString(),
      vaultAirdropGains: data.vaultAirdropGains.toString(),
      vaultSecondaryBought: data.vaultSecondaryBought.toString(),
      vaultSecondarySold: data.vaultSecondarySold.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
      vaultUnredeemedClaim: data.vaultUnredeemedClaim.toString(),
    },
    update: {
      vaultBalance: data.vaultBalance.toString(),
      vaultAvailableAssets: data.vaultAvailableAssets.toString(),
      vaultDeployed: data.vaultDeployed.toString(),
      escrowBalance: data.escrowBalance.toString(),
      vaultRealizedPnL: data.vaultRealizedPnL.toString(),
      vaultAirdropGains: data.vaultAirdropGains.toString(),
      vaultSecondaryBought: data.vaultSecondaryBought.toString(),
      vaultSecondarySold: data.vaultSecondarySold.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
      vaultUnredeemedClaim: data.vaultUnredeemedClaim.toString(),
    },
  });
}

const DEFAULT_SNAPSHOT_INTERVAL_SECONDS = 86400;

export function resolveSnapshotIntervalSeconds(override?: number): number {
  if (override && Number.isFinite(override) && override > 0) return override;
  const env = process.env.PROTOCOL_STATS_INTERVAL_SECONDS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SNAPSHOT_INTERVAL_SECONDS;
}

/**
 * Main function to compute and store protocol stats snapshots, one row per
 * configured vault on the chain.
 *
 * The snapshot timestamp is floored to the configured interval so bars line
 * up on predictable boundaries regardless of exactly when the cron fires.
 * Block resolution + escrow summation happen ONCE per call (chain-scoped);
 * everything inside the per-vault loop scopes to that vault.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    console.log(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, ` +
      `${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}, ` +
      `interval ${interval}s`
  );

  const timestamp = Math.floor(Date.now() / 1000 / interval) * interval;

  // Resolve the block for this timestamp so on-chain reads are pinned. Without
  // this, readContract would fall through to chain head, which can be several
  // seconds/minutes past the stored timestamp — causing systematic drift
  // between cron snapshots and backfilled snapshots for the same timestamp.
  const targetBlock = await getBlockByTimestamp(client, timestamp);
  const blockNumber = targetBlock.number;
  if (blockNumber === null) {
    throw new Error(
      `[ProtocolStats] Resolved a pending block for timestamp ${timestamp}; refusing to write a snapshot at chain-head state.`
    );
  }
  console.log(
    `[ProtocolStats] Resolved block ${blockNumber} for timestamp ${timestamp} (block ts=${targetBlock.timestamp})`
  );

  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Escrow is chain-wide (shared across all vault families on this chain), so
  // sum it once and attach the same value to every per-vault snapshot.
  const escrowBalance = await sumEscrowBalancesAtBlock(
    client,
    chainId,
    blockNumber
  );
  console.log(
    `[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe (V2 primary + past deploys)`
  );

  for (const vault of vaults) {
    // Pick historically-correct vault address for this block — handles vault
    // migrations via `getContractForBlock`.
    const vaultAddr = getContractForBlock(vault.config, blockNumber);

    // On-chain reads pinned to `blockNumber` in parallel. availableAssets()
    // may revert on older vault contracts pre-dating that function — catch
    // and fall through to vaultBalance.
    const [vaultBalance, vaultAvailableAssetsOrNull] = await Promise.all([
      vaultAddr && collateralAddress
        ? client.readContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [vaultAddr],
            blockNumber,
          })
        : Promise.resolve(0n),
      vaultAddr
        ? client
            .readContract({
              address: vaultAddr,
              abi: predictionMarketVaultAbi,
              functionName: 'availableAssets',
              args: [],
              blockNumber,
            })
            .then((v: unknown) => v as bigint)
            .catch(() => null as bigint | null)
        : Promise.resolve(0n as bigint | null),
    ]);

    const vaultAvailableAssets =
      vaultAvailableAssetsOrNull === null
        ? vaultBalance
        : vaultAvailableAssetsOrNull;

    // DB-derived aggregates scoped to this vault — same snapshot timestamp.
    // Note: `calculateVaultUnredeemedClaim` runs after the main Promise.all so
    // its prediction.findMany calls don't interleave with fetchVaultDeployed /
    // calculateVaultPnL (which both query Prediction in a specific order the
    // cron-path tests rely on).
    const [
      vaultDeployed,
      pnlResult,
      flowsResult,
      secondaryFlows,
      airdropGains,
    ] = await Promise.all([
      fetchVaultDeployedAtBlock(chainId, blockNumber, timestamp, vault.address),
      calculateVaultPnL(chainId, timestamp, vault.address),
      calculateVaultFlows(chainId, timestamp, vault.address),
      calculateVaultSecondaryFlows(chainId, timestamp, vault.address),
      calculateVaultAirdrops(chainId, timestamp, vault.address),
    ]);
    const unredeemedClaim = await calculateVaultUnredeemedClaim(
      chainId,
      timestamp,
      vault.address
    );

    // Reconciliation identity:
    //   balance + deployed
    //     = deposits - withdrawals
    //     + settlementPnL  (Close-based)
    //     + secondarySold - secondaryBought
    //     + airdrops       (CollateralTransfer-based residual)
    const actualTotalAssets = vaultBalance + vaultDeployed;
    const expectedTotalAssets =
      flowsResult.totalDeposits -
      flowsResult.totalWithdrawals +
      pnlResult.realizedPnL +
      secondaryFlows.sold -
      secondaryFlows.bought +
      airdropGains;
    const reconciliationDelta = actualTotalAssets - expectedTotalAssets;

    console.log(
      `[ProtocolStats] ${vault.kind}@${vault.address}: ` +
        `balance=${formatUnits(vaultBalance, 18)}, available=${formatUnits(vaultAvailableAssets, 18)}, ` +
        `deployed=${formatUnits(vaultDeployed, 18)}, unredeemed=${formatUnits(unredeemedClaim, 18)}, ` +
        `pnl=${formatUnits(pnlResult.realizedPnL, 18)} ` +
        `(won ${pnlResult.positionsWon}/lost ${pnlResult.positionsLost}), ` +
        `flows=+${formatUnits(flowsResult.totalDeposits, 18)}/-${formatUnits(flowsResult.totalWithdrawals, 18)}, ` +
        `secondary=+${formatUnits(secondaryFlows.sold, 18)}/-${formatUnits(secondaryFlows.bought, 18)}, ` +
        `airdrop=${formatUnits(airdropGains, 18)}, ` +
        `reconciliation Δ=${formatUnits(reconciliationDelta, 18)}`
    );

    // A non-zero reconciliation Δ means the identity
    //   balance + deployed = deposits − withdrawals + pnl + (sold − bought) + airdrops
    // didn't balance — wUSDe entered or left the vault via a path no
    // accounting leg models (un-tracked off-protocol transfer, missing
    // CollateralTransfer indexer row, ungated mint to/from a non-vault-side
    // Prediction record, etc.). Logged at info-level rather than error
    // because cumulative-balance drift persists across every subsequent
    // snapshot — making it loud causes alert fatigue rather than action.
    if (reconciliationDelta !== 0n) {
      console.log(
        `[ProtocolStats] reconciliation Δ ≠ 0 for ${vault.kind}@${vault.address} ts=${timestamp}: Δ=${formatUnits(reconciliationDelta, 18)} USDe ` +
          `(LHS balance+deployed=${formatUnits(actualTotalAssets, 18)} vs RHS=${formatUnits(expectedTotalAssets, 18)})`
      );
    }

    if (GAP_DEBUG()) {
      const decomp = await decomposeVaultGap(chainId, timestamp, vault.address);
      console.log(
        formatGapDecomposition(
          `ts=${timestamp} ${vault.kind}@${vault.address}`,
          decomp,
          vaultBalance,
          vaultDeployed,
          flowsResult.totalDeposits,
          flowsResult.totalWithdrawals,
          pnlResult.realizedPnL,
          secondaryFlows,
          airdropGains
        )
      );
    }

    await upsertProtocolStatsSnapshot(timestamp, chainId, vault.address, {
      vaultBalance,
      vaultAvailableAssets,
      vaultDeployed,
      escrowBalance,
      vaultRealizedPnL: pnlResult.realizedPnL,
      vaultAirdropGains: airdropGains,
      vaultSecondaryBought: secondaryFlows.bought,
      vaultSecondarySold: secondaryFlows.sold,
      vaultDeposits: flowsResult.totalDeposits,
      vaultWithdrawals: flowsResult.totalWithdrawals,
      vaultPositionsWon: pnlResult.positionsWon,
      vaultPositionsLost: pnlResult.positionsLost,
      vaultCollateralWon: pnlResult.totalCollateralWon,
      vaultCollateralLost: pnlResult.totalCollateralLost,
      vaultUnredeemedClaim: unredeemedClaim,
    });
  }

  console.log(
    `[ProtocolStats] Snapshots stored: ${vaults.length} row(s) at ts=${timestamp}`
  );
}

/**
 * Get stats time series. If `days` is provided, limits to the last N days.
 * If omitted, returns all available snapshots.
 *
 * `vaultAddress` may be a single address or an array. Passing an array enables
 * the caller to include historical primaries (current SDK primary plus its
 * `legacy[]` chain) so the time series stays continuous across vault redeploys
 * — without an array, rows written under a since-demoted primary would be
 * orphaned by the equality filter.
 */
export async function getLatestProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string
) {
  return prisma.protocolStatsSnapshot.findFirst({
    where: { chainId, ...(vaultAddress ? { vaultAddress } : {}) },
    orderBy: { timestamp: 'desc' },
  });
}

export async function getProtocolStatsTimeSeries(
  days?: number,
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string | readonly string[]
) {
  const vaultFilter = (() => {
    if (!vaultAddress) return {};
    if (Array.isArray(vaultAddress)) {
      if (vaultAddress.length === 0) return {};
      if (vaultAddress.length === 1) return { vaultAddress: vaultAddress[0] };
      return { vaultAddress: { in: vaultAddress as string[] } };
    }
    return { vaultAddress: vaultAddress as string };
  })();

  return prisma.protocolStatsSnapshot.findMany({
    where: {
      ...(days
        ? {
            timestamp: {
              gte: getUtcMidnightTimestamp(new Date()) - days * 86400,
            },
          }
        : {}),
      chainId,
      ...vaultFilter,
    },
    orderBy: { timestamp: 'asc' },
  });
}

// Phase 1 (block resolution) is RPC-only: 1 inflight RPC per worker.
// 10 workers ≈ 10 req/sec peak.
const BACKFILL_BLOCK_RESOLUTION_CONCURRENCY = 10;

// Phase 2 (per-snapshot work) fires 3 parallel RPC reads per worker.
// 3 workers × 3 parallel reads = ~9 concurrent RPCs at peak — under
// Conduit's free-tier rate limits. Also comfortably below Prisma's default
// 10-conn pool (3 workers × 3 parallel DB reads = ~9 peak queries).
const BACKFILL_SNAPSHOT_CONCURRENCY = 3;

/**
 * Backfill historical protocol stats by querying on-chain state at past blocks.
 *
 * `days` is the time horizon (how far back to go). `intervalSeconds` controls
 * the spacing between snapshots — defaults to the configured snapshot interval
 * (env `PROTOCOL_STATS_INTERVAL_SECONDS`, fallback 86400).
 *
 * Runs in two phases:
 *   Phase 1: resolve every non-pre-launch timestamp to a block number in bulk,
 *            using a chunked blockspace skeleton + parallel binary searches
 *            (see `resolveBlocksForTimestamps` in utils).
 *   Phase 2: for each (timestamp, blockNumber) pair, fetch on-chain state +
 *            aggregate DB-derived metrics + upsert, all under BACKFILL_SNAPSHOT_CONCURRENCY.
 */
const ZERO_SNAPSHOT: ProtocolStatsData = {
  vaultBalance: 0n,
  vaultAvailableAssets: 0n,
  vaultDeployed: 0n,
  escrowBalance: 0n,
  vaultRealizedPnL: 0n,
  vaultAirdropGains: 0n,
  vaultSecondaryBought: 0n,
  vaultSecondarySold: 0n,
  vaultDeposits: 0n,
  vaultWithdrawals: 0n,
  vaultUnredeemedClaim: 0n,
  vaultPositionsWon: 0,
  vaultPositionsLost: 0,
  vaultCollateralWon: 0n,
  vaultCollateralLost: 0n,
};

export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    console.log(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}, ` +
      `${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}, ` +
      `interval ${interval}s, phase1-concurrency ${BACKFILL_BLOCK_RESOLUTION_CONCURRENCY}, ` +
      `phase2-concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY}`
  );

  // End boundary is "now" floored to the interval; walk back in interval steps.
  const endBoundary = Math.floor(Date.now() / 1000 / interval) * interval;
  const totalSpan = days * 86400;
  const steps = Math.floor(totalSpan / interval);
  const timestamps: number[] = [];
  for (let i = steps; i >= 0; i--) {
    timestamps.push(endBoundary - i * interval);
  }

  // Per-phase wall-clock timing.
  const totals = {
    skeleton: 0,
    resolveBlocks: 0,
    rpcReads: 0,
    dbReads: 0,
    upsert: 0,
  };

  // Ethereal mainnet launched ~October 20, 2025. Before this date no contracts
  // existed on-chain, so pre-launch rows get a zero-valued upsert (no RPC).
  const ETHEREAL_MAINNET_LAUNCH = Math.floor(Date.UTC(2025, 9, 20) / 1000);

  const preLaunch = timestamps.filter((t) => t < ETHEREAL_MAINNET_LAUNCH);
  const postLaunch = timestamps.filter((t) => t >= ETHEREAL_MAINNET_LAUNCH);

  console.log(
    `[ProtocolStats] Timestamps built: total=${timestamps.length}, preLaunch=${preLaunch.length}, postLaunch=${postLaunch.length}`
  );

  const backfillStart = performance.now();
  let successCount = 0;
  let skipCount = 0;
  const resolved: Array<{ timestamp: number; blockNumber: bigint }> = [];
  let crashError: unknown = null;

  try {
    // ── Phase 1: resolve blocks for all post-launch timestamps in bulk ──
    const tResolve = performance.now();
    let blocks: Block[] = [];
    if (postLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 1: starting block resolution for ${postLaunch.length} post-launch timestamps...`
      );
      blocks = await resolveBlocksForTimestamps(client, postLaunch, {
        concurrency: BACKFILL_BLOCK_RESOLUTION_CONCURRENCY,
        logPrefix: '[ProtocolStats] Phase 1',
      });
    } else {
      console.log(
        `[ProtocolStats] Phase 1: skipped (no post-launch timestamps)`
      );
    }
    totals.resolveBlocks = performance.now() - tResolve;

    console.log(
      `[ProtocolStats] Phase 1: resolved ${postLaunch.length} target blocks in ${(totals.resolveBlocks / 1000).toFixed(1)}s`
    );

    // Pair post-launch timestamps with their resolved blocks.
    for (let i = 0; i < postLaunch.length; i++) {
      const blockNumber = blocks[i]?.number;
      if (blockNumber === null || blockNumber === undefined) {
        console.log(
          `[ProtocolStats] Skipping ${postLaunch[i]} - no block resolved`
        );
        continue;
      }
      resolved.push({ timestamp: postLaunch[i], blockNumber });
    }

    // ── Phase 2: parallel per-snapshot work ──
    const collateralAddress = contracts.collateralToken[chainId]?.address as
      | `0x${string}`
      | undefined;

    // One-shot pre-fetch of every prediction + flow event the per-iter DB
    // aggregators could ever need across all configured vaults. Replaces
    // (3 findMany) × (V vaults) × (T timestamps) round-trips with O(1) sync
    // calls per iter.
    const tAggBuild = performance.now();
    const aggregator = await buildVaultAggregator(chainId);
    console.log(
      `[ProtocolStats] Phase 2 prep: built in-memory aggregator in ${(performance.now() - tAggBuild).toFixed(0)}ms`
    );

    // Pre-launch zero-fills first — just DB upserts, no RPC. One row per
    // configured vault per pre-launch timestamp.
    if (preLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2a: upserting ${preLaunch.length} × ${vaults.length} pre-launch zero-fills...`
      );
      const tPreLaunch = performance.now();
      const totalPreUpserts = preLaunch.length * vaults.length;
      const preStep = Math.max(1, Math.floor(totalPreUpserts / 10));
      await runParallelWork(
        preLaunch,
        BACKFILL_SNAPSHOT_CONCURRENCY,
        async (timestamp) => {
          for (const vault of vaults) {
            const t0 = performance.now();
            await upsertProtocolStatsSnapshot(
              timestamp,
              chainId,
              vault.address,
              ZERO_SNAPSHOT
            );
            totals.upsert += performance.now() - t0;
            skipCount++;
            if (skipCount % preStep === 0 || skipCount === totalPreUpserts) {
              console.log(
                `[ProtocolStats] Phase 2a: ${skipCount}/${totalPreUpserts} (${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s)`
              );
            }
          }
        }
      );
      console.log(
        `[ProtocolStats] Phase 2a: done in ${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s`
      );
    }

    // Real on-chain snapshots — fan out per-vault inside each timestamp.
    if (resolved.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2b: fetching on-chain state + DB aggregates for ${resolved.length} timestamps × ${vaults.length} vault(s) (concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY})...`
      );
    }
    const totalRealUpserts = resolved.length * vaults.length;
    let doneCount = 0;
    await runParallelWork(
      resolved,
      BACKFILL_SNAPSHOT_CONCURRENCY,
      async ({ timestamp, blockNumber }) => {
        const iterStart = performance.now();
        const dateStr =
          interval < 86400
            ? new Date(timestamp * 1000).toISOString().replace('.000Z', 'Z')
            : new Date(timestamp * 1000).toISOString().split('T')[0];

        // Escrow is shared across all vault families on this chain — sum once
        // per (timestamp, block) and reuse across the per-vault loop.
        const tEscrow = performance.now();
        const escrowBalance = await sumEscrowBalancesAtBlock(
          client,
          chainId,
          blockNumber
        );
        let rpcMs = performance.now() - tEscrow;

        for (const vault of vaults) {
          // Pick the vault address that was actually live at this block —
          // handles redeploy boundaries (a since-demoted primary's snapshots
          // for blocks before the new primary's deployment must read from
          // the legacy address, not the current one).
          const vaultAddrAtBlock = getContractForBlock(
            vault.config,
            blockNumber
          );

          if (!vaultAddrAtBlock) {
            // Block predates this vault entirely. Write a zero row so the
            // time series has a continuous backbone instead of gaps.
            const t0 = performance.now();
            await upsertProtocolStatsSnapshot(
              timestamp,
              chainId,
              vault.address,
              { ...ZERO_SNAPSHOT, escrowBalance }
            );
            totals.upsert += performance.now() - t0;
            successCount++;
            doneCount++;
            continue;
          }

          // Two parallel RPC reads pinned to blockNumber. availableAssets()
          // may revert on legacy vault contracts pre-dating that function;
          // fall back to vaultBalance.
          const tRpcVault = performance.now();
          const [vaultBalance, vaultAvailableAssetsOrNull] = await Promise.all([
            collateralAddress
              ? client.readContract({
                  address: collateralAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [vaultAddrAtBlock],
                  blockNumber,
                })
              : Promise.resolve(0n),
            client
              .readContract({
                address: vaultAddrAtBlock,
                abi: predictionMarketVaultAbi,
                functionName: 'availableAssets',
                args: [],
                blockNumber,
              })
              .then((v) => v as bigint)
              .catch(() => null as bigint | null),
          ]);
          rpcMs += performance.now() - tRpcVault;

          const vaultAvailableAssets =
            vaultAvailableAssetsOrNull === null
              ? vaultBalance
              : vaultAvailableAssetsOrNull;

          // DB-derived metrics — sync in-memory aggregation scoped to the
          // historical address (so post-redeploy stats only see prior-deployment
          // predictions on pre-redeploy blocks, fixing the boundary bug).
          const tDb = performance.now();
          const historicalAddrLower = vaultAddrAtBlock.toLowerCase();
          const vaultDeployed = aggregator.deployedAt(
            timestamp,
            historicalAddrLower
          );
          const pnlResult = aggregator.pnlAt(timestamp, historicalAddrLower);
          const flowsResult = aggregator.flowsAt(
            timestamp,
            historicalAddrLower
          );
          const unredeemedClaim = aggregator.unredeemedClaimAt(
            timestamp,
            historicalAddrLower
          );
          const secondaryFlows = aggregator.secondaryAt(
            timestamp,
            historicalAddrLower
          );
          const airdropGains = aggregator.airdropsAt(
            timestamp,
            historicalAddrLower
          );
          totals.dbReads += performance.now() - tDb;

          // Reconciliation identity (1634):
          //   balance + deployed = deposits − withdrawals + settlementPnL
          //                        + (secondarySold − secondaryBought) + airdrops
          const actualTotalAssets = vaultBalance + vaultDeployed;
          const expectedTotalAssets =
            flowsResult.totalDeposits -
            flowsResult.totalWithdrawals +
            pnlResult.realizedPnL +
            secondaryFlows.sold -
            secondaryFlows.bought +
            airdropGains;
          const reconciliationDelta = actualTotalAssets - expectedTotalAssets;
          // See `computeAndStoreProtocolStats` for the rationale on why this
          // stays at log-level rather than error.
          if (reconciliationDelta !== 0n) {
            console.log(
              `[ProtocolStats] reconciliation Δ ≠ 0 for ${vault.kind}@${historicalAddrLower} ts=${timestamp}: Δ=${formatUnits(reconciliationDelta, 18)} USDe ` +
                `(LHS balance+deployed=${formatUnits(actualTotalAssets, 18)} vs RHS=${formatUnits(expectedTotalAssets, 18)})`
            );
          }

          if (GAP_DEBUG()) {
            const decomp = aggregator.gapDecompositionAt(
              timestamp,
              historicalAddrLower
            );
            console.log(
              formatGapDecomposition(
                `ts=${timestamp} ${vault.kind}@${historicalAddrLower}`,
                decomp,
                vaultBalance,
                vaultDeployed,
                flowsResult.totalDeposits,
                flowsResult.totalWithdrawals,
                pnlResult.realizedPnL,
                secondaryFlows,
                airdropGains
              )
            );
          }

          const tUpsert = performance.now();
          // Always upsert under the vault's CURRENT primary address (vault.address)
          // — rows are keyed by vault category, not by historical deployment.
          await upsertProtocolStatsSnapshot(timestamp, chainId, vault.address, {
            vaultBalance,
            vaultAvailableAssets,
            vaultDeployed,
            escrowBalance,
            vaultRealizedPnL: pnlResult.realizedPnL,
            vaultAirdropGains: airdropGains,
            vaultSecondaryBought: secondaryFlows.bought,
            vaultSecondarySold: secondaryFlows.sold,
            vaultDeposits: flowsResult.totalDeposits,
            vaultWithdrawals: flowsResult.totalWithdrawals,
            vaultPositionsWon: pnlResult.positionsWon,
            vaultPositionsLost: pnlResult.positionsLost,
            vaultCollateralWon: pnlResult.totalCollateralWon,
            vaultCollateralLost: pnlResult.totalCollateralLost,
            vaultUnredeemedClaim: unredeemedClaim,
          });
          totals.upsert += performance.now() - tUpsert;

          successCount++;
          doneCount++;
        }

        totals.rpcReads += rpcMs;
        const iterMs = performance.now() - iterStart;
        console.log(
          `[ProtocolStats] ${dateStr} block=${blockNumber} [${doneCount}/${totalRealUpserts}] ` +
            `iter=${iterMs.toFixed(0)}ms ` +
            `escrow=${formatUnits(escrowBalance, 18)} ` +
            `(${vaults.length} vault upsert${vaults.length === 1 ? '' : 's'})`
        );
      }
    );
  } catch (err) {
    crashError = err;
    console.error(
      '[ProtocolStats] Backfill threw — printing partial stats below:',
      err
    );
  }

  // Always print the summary — on both success and failure.
  const elapsedMs = performance.now() - backfillStart;
  const phase2WallMs = Math.max(0, elapsedMs - totals.resolveBlocks);
  const phase2CumulativeMs = totals.rpcReads + totals.dbReads + totals.upsert;
  const wallPct = (ms: number) =>
    `${(ms / 1000).toFixed(1)}s (${elapsedMs > 0 ? ((ms / elapsedMs) * 100).toFixed(1) : '0'}% wall)`;
  const cumShare = (ms: number) =>
    `${(ms / 1000).toFixed(1)}s cumulative across workers (${phase2CumulativeMs > 0 ? ((ms / phase2CumulativeMs) * 100).toFixed(1) : '0'}% of phase-2 work)`;
  const verdict = crashError ? 'INCOMPLETE (see error above)' : 'complete';
  console.log(
    `[ProtocolStats] Backfill ${verdict}: ${successCount} snapshot upserts (across ${vaults.length} vault(s)), ${skipCount} pre-launch zero-fills, ${Math.max(0, postLaunch.length - resolved.length) * vaults.length} skipped in ${(elapsedMs / 1000).toFixed(1)}s\n` +
      `  Phase 1 (block resolution): ${wallPct(totals.resolveBlocks)}\n` +
      `  Phase 2 (per-snapshot work): ${wallPct(phase2WallMs)}\n` +
      `    rpc reads:    ${cumShare(totals.rpcReads)}\n` +
      `    db reads:     ${cumShare(totals.dbReads)}\n` +
      `    db upsert:    ${cumShare(totals.upsert)}`
  );

  if (crashError) throw crashError;
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight. Awaits all
 * to finish. Unlike the one in utils, this doesn't need to return results.
 */
async function runParallelWork<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        await fn(items[idx]);
      }
    }
  );
  await Promise.all(workers);
}
