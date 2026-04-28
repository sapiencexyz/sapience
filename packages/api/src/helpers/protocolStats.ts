import {
  ContractFunctionExecutionError,
  erc20Abi,
  formatUnits,
  type Block,
} from 'viem';
import prisma from '../db';
import { SettlementResult } from '../../generated/prisma';
import {
  getProviderForChain,
  getBlockByTimestamp,
  resolveBlocksForTimestamps,
} from '../utils/utils';
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
}

/**
 * Fetch Vault balance: collateral.balanceOf(vault)
 */
export async function fetchVaultTVL(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
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
    args: [vaultAddress],
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
  atTimestamp?: number
): Promise<bigint> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress.toLowerCase(),
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
  atTimestamp?: number
): Promise<bigint> {
  return fetchVaultDeployed(chainId, atTimestamp);
}

/**
 * Fetch Vault available assets: vault.availableAssets()
 */
export async function fetchVaultAvailableAssets(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress,
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
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress,
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
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
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
    args: [vaultAddress],
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
 * Calculate vault's realized settlement PnL.
 *
 * Sources gross settlement payouts from `Close` (the actual on-chain holder
 * and payout at burn time) rather than `Prediction.predictor` /
 * `Prediction.counterparty` (creation-time addresses). This matters because
 * NFT positions can transfer on the secondary market: only the holder at
 * close time receives the payout, even though the original predictor and
 * counterparty addresses are immutable on the Prediction record.
 *
 * Cost basis (the original collateral the vault committed at primary
 * creation) still comes from `Prediction`, scoped to predictions whose
 * pickConfig has resolved. Secondary-market cost basis is tracked
 * separately via `calculateVaultSecondaryFlows`.
 *
 *   realizedPnL = sum(payout to vault holder via Close)
 *               − sum(vault's primary collateral on resolved predictions)
 *
 * Reconciles against `vaultBalance + vaultDeployed` together with deposits,
 * withdrawals, secondary buys/sells, and airdrops.
 */
export async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultPnLResult> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) {
    return {
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    };
  }
  const vaultAddressLower = vaultAddress.toLowerCase();

  // Gross payouts: what the vault actually received from settlement,
  // based on who held the position tokens when they were burned.
  const closes = await prisma.close.findMany({
    where: {
      chainId,
      ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
      OR: [
        { predictorHolder: vaultAddressLower },
        { counterpartyHolder: vaultAddressLower },
      ],
    },
    select: {
      predictorHolder: true,
      counterpartyHolder: true,
      predictorPayout: true,
      counterpartyPayout: true,
    },
  });

  let grossPayouts = 0n;
  let positionsWon = 0;
  let positionsLost = 0;
  let totalCollateralWon = 0n;
  let totalCollateralLost = 0n;

  for (const close of closes) {
    if (close.predictorHolder.toLowerCase() === vaultAddressLower) {
      const payout = BigInt(close.predictorPayout);
      grossPayouts += payout;
      if (payout > 0n) {
        positionsWon++;
        totalCollateralWon += payout;
      } else {
        positionsLost++;
      }
    }
    if (close.counterpartyHolder.toLowerCase() === vaultAddressLower) {
      const payout = BigInt(close.counterpartyPayout);
      grossPayouts += payout;
      if (payout > 0n) {
        positionsWon++;
        totalCollateralWon += payout;
      } else {
        positionsLost++;
      }
    }
  }

  // Cost basis: primary-creation collateral the vault committed for
  // predictions whose pickConfig has now resolved. Sold-on-secondary
  // positions still count here — the cost was paid at creation, and the
  // sale proceeds are tracked separately in vaultSecondarySold.
  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      pickConfigId: { not: null },
      pickConfiguration: {
        resolved: true,
        result: { not: SettlementResult.UNRESOLVED },
        ...(beforeTimestamp ? { resolvedAt: { lte: beforeTimestamp } } : {}),
      },
      OR: [
        { predictor: vaultAddressLower },
        { counterparty: vaultAddressLower },
      ],
    },
    select: {
      predictor: true,
      counterparty: true,
      predictorCollateral: true,
      counterpartyCollateral: true,
    },
  });

  let primaryCollateral = 0n;
  for (const p of predictions) {
    if (p.predictor.toLowerCase() === vaultAddressLower) {
      primaryCollateral += BigInt(p.predictorCollateral);
    }
    if (p.counterparty.toLowerCase() === vaultAddressLower) {
      primaryCollateral += BigInt(p.counterpartyCollateral);
    }
  }

  totalCollateralLost = primaryCollateral;
  const realizedPnL = grossPayouts - primaryCollateral;

  return {
    realizedPnL,
    positionsWon,
    positionsLost,
    totalCollateralWon,
    totalCollateralLost,
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
  beforeTimestamp?: number
): Promise<VaultSecondaryFlowsResult> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) return { bought: 0n, sold: 0n };
  const vaultAddressLower = vaultAddress.toLowerCase();

  const trades = await prisma.secondaryTrade.findMany({
    where: {
      chainId,
      ...(beforeTimestamp ? { executedAt: { lte: beforeTimestamp } } : {}),
      OR: [{ buyer: vaultAddressLower }, { seller: vaultAddressLower }],
    },
    select: { buyer: true, seller: true, price: true },
  });

  let bought = 0n;
  let sold = 0n;
  for (const t of trades) {
    if (t.buyer.toLowerCase() === vaultAddressLower) {
      bought += BigInt(t.price);
    }
    if (t.seller.toLowerCase() === vaultAddressLower) {
      sold += BigInt(t.price);
    }
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
  beforeTimestamp?: number
): Promise<bigint> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) return 0n;
  const vaultAddressLower = vaultAddress.toLowerCase();

  const transferWhere: {
    chainId: number;
    to: string;
    timestamp?: { lte: Date };
  } = {
    chainId,
    to: vaultAddressLower,
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

  const flows = await calculateVaultFlows(chainId, beforeTimestamp);

  // Gross settlement payouts the vault received as the on-chain holder.
  const closes = await prisma.close.findMany({
    where: {
      chainId,
      ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
      OR: [
        { predictorHolder: vaultAddressLower },
        { counterpartyHolder: vaultAddressLower },
      ],
    },
    select: {
      predictorHolder: true,
      counterpartyHolder: true,
      predictorPayout: true,
      counterpartyPayout: true,
    },
  });
  let settlementInflow = 0n;
  for (const c of closes) {
    if (c.predictorHolder.toLowerCase() === vaultAddressLower) {
      settlementInflow += BigInt(c.predictorPayout);
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddressLower) {
      settlementInflow += BigInt(c.counterpartyPayout);
    }
  }

  const secondary = await calculateVaultSecondaryFlows(
    chainId,
    beforeTimestamp
  );

  const explained = flows.totalDeposits + settlementInflow + secondary.sold;
  return transfersIn > explained ? transfersIn - explained : 0n;
}

/**
 * Calculate vault's cumulative deposits and withdrawals from indexed flow events.
 */
export async function calculateVaultFlows(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultFlowsResult> {
  const whereClause: { chainId: number; timestamp?: { lte: number } } = {
    chainId,
  };

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
 * Synchronous, in-memory replacements for `fetchVaultDeployed`,
 * `calculateVaultPnL`, and `calculateVaultFlows`. The backfill loop calls all
 * three per snapshot; doing each as a `findMany` round-trip causes N×table_scan
 * amplification (e.g. 541 snapshots × full prediction-table scan). The
 * underlying tables don't change during a backfill, so we pre-fetch the
 * superset once and aggregate in JS for each timestamp.
 *
 * The cron path + GraphQL resolver still call the original async helpers —
 * those run once per request, so this micro-optimization isn't worth the
 * complexity there.
 */
export interface VaultAggregator {
  deployedAt: (timestamp: number) => bigint;
  pnlAt: (timestamp: number) => VaultPnLResult;
  flowsAt: (timestamp: number) => VaultFlowsResult;
  secondaryAt: (timestamp: number) => VaultSecondaryFlowsResult;
  airdropsAt: (timestamp: number) => bigint;
}

export async function buildVaultAggregator(
  chainId: number
): Promise<VaultAggregator> {
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();
  if (!vaultAddress) {
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
      secondaryAt: () => ({ bought: 0n, sold: 0n }),
      airdropsAt: () => 0n,
    };
  }

  // Fetch the union of every prediction, flow event, close, secondary trade,
  // and inbound collateral transfer the per-iter aggregators could ever need.
  const [predictions, flows, closes, trades, transfers] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        chainId,
        OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
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
      select: { timestamp: true, eventType: true, assets: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
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
    prisma.secondaryTrade.findMany({
      where: {
        chainId,
        OR: [{ buyer: vaultAddress }, { seller: vaultAddress }],
      },
      select: {
        executedAt: true,
        buyer: true,
        seller: true,
        price: true,
      },
    }),
    prisma.collateralTransfer.findMany({
      where: { chainId, to: vaultAddress },
      select: { timestamp: true, value: true },
    }),
  ]);

  // Predicate ports of the SQL filters in the async helpers. Keep these
  // inline so a future reader can audit the JS branches against the SQL.
  const deployedAt = (t: number): bigint => {
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

  // Settlement PnL: gross payouts from Close (the actual on-chain holder at
  // burn time) minus primary-creation collateral the vault committed for
  // resolved predictions. See the `calculateVaultPnL` docstring for the full
  // reconciliation identity.
  const pnlAt = (t: number): VaultPnLResult => {
    let grossPayouts = 0n;
    let positionsWon = 0;
    let positionsLost = 0;
    let totalCollateralWon = 0n;

    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        const payout = BigInt(c.predictorPayout);
        grossPayouts += payout;
        if (payout > 0n) {
          positionsWon++;
          totalCollateralWon += payout;
        } else {
          positionsLost++;
        }
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        const payout = BigInt(c.counterpartyPayout);
        grossPayouts += payout;
        if (payout > 0n) {
          positionsWon++;
          totalCollateralWon += payout;
        } else {
          positionsLost++;
        }
      }
    }

    let primaryCollateral = 0n;
    for (const p of predictions) {
      if (p.pickConfigId === null) continue;
      const pc = p.pickConfiguration;
      if (!pc || !pc.resolved) continue;
      if (pc.result === SettlementResult.UNRESOLVED) continue;
      if (pc.resolvedAt === null || pc.resolvedAt > t) continue;

      if (p.predictor.toLowerCase() === vaultAddress) {
        primaryCollateral += BigInt(p.predictorCollateral);
      }
      if (p.counterparty.toLowerCase() === vaultAddress) {
        primaryCollateral += BigInt(p.counterpartyCollateral);
      }
    }

    return {
      realizedPnL: grossPayouts - primaryCollateral,
      positionsWon,
      positionsLost,
      totalCollateralWon,
      totalCollateralLost: primaryCollateral,
    };
  };

  const flowsAt = (t: number): VaultFlowsResult => {
    let totalDeposits = 0n;
    let totalWithdrawals = 0n;
    for (const e of flows) {
      if (e.timestamp > t) continue;
      const assets = BigInt(e.assets);
      if (e.eventType === 'deposit') totalDeposits += assets;
      else totalWithdrawals += assets;
    }
    return { totalDeposits, totalWithdrawals };
  };

  const secondaryAt = (t: number): VaultSecondaryFlowsResult => {
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
  const airdropsAt = (t: number): bigint => {
    let transfersIn = 0n;
    for (const tr of transfers) {
      if (Math.floor(tr.timestamp.getTime() / 1000) > t) continue;
      transfersIn += BigInt(tr.value);
    }

    let settlementInflow = 0n;
    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.predictorPayout);
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.counterpartyPayout);
      }
    }

    const flowsRes = flowsAt(t);
    const secondary = secondaryAt(t);
    const explained =
      flowsRes.totalDeposits + settlementInflow + secondary.sold;
    return transfersIn > explained ? transfersIn - explained : 0n;
  };

  return { deployedAt, pnlAt, flowsAt, secondaryAt, airdropsAt };
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
 * Main function to compute and store a protocol stats snapshot.
 *
 * The snapshot timestamp is floored to the configured interval so bars line
 * up on predictable boundaries regardless of exactly when the cron fires.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, vault ${vaultAddress}, interval ${interval}s`
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

  // Pick historically-correct vault address for this block — handles vault
  // migrations via `getContractForBlock`. Escrow totals are aggregated
  // separately by `sumEscrowBalancesAtBlock`.
  const vaultConfig = contracts.predictionMarketVault[chainId];
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;

  const vaultAddr = vaultConfig
    ? getContractForBlock(vaultConfig, blockNumber)
    : null;

  // On-chain reads, all pinned to `blockNumber` and run in parallel. The
  // availableAssets() read may revert on older vault contracts that pre-date
  // that function — catch and fall through to vaultBalance. Escrow is summed
  // across current + all past V2 deploys, so funds stuck in old escrow
  // contracts are still counted.
  const [vaultBalance, vaultAvailableAssetsOrNull, escrowBalance] =
    await Promise.all([
      vaultAddr && collateralAddress
        ? client.readContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [vaultAddr],
            blockNumber,
          })
        : Promise.resolve(0n),
      vaultAddr && collateralAddress
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
      sumEscrowBalancesAtBlock(client, chainId, blockNumber),
    ]);

  const vaultAvailableAssets =
    vaultAvailableAssetsOrNull === null
      ? vaultBalance
      : vaultAvailableAssetsOrNull;

  console.log(
    `[ProtocolStats] Vault: ${formatUnits(vaultBalance, 18)} balance, ${formatUnits(vaultAvailableAssets, 18)} available`
  );
  console.log(
    `[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe (V2 primary + past deploys)`
  );

  // DB-derived aggregates — pass the same snapshot timestamp so these are also
  // evaluated at "state as of timestamp", matching the on-chain reads above.
  const [vaultDeployed, pnlResult, flowsResult] = await Promise.all([
    fetchVaultDeployedAtBlock(chainId, blockNumber, timestamp),
    calculateVaultPnL(chainId, timestamp),
    calculateVaultFlows(chainId, timestamp),
  ]);
  console.log(
    `[ProtocolStats] Vault PnL: ${formatUnits(pnlResult.realizedPnL, 18)} USDe (won: ${pnlResult.positionsWon}, lost: ${pnlResult.positionsLost})`
  );
  console.log(
    `[ProtocolStats] Deposits: ${formatUnits(flowsResult.totalDeposits, 18)}, Withdrawals: ${formatUnits(flowsResult.totalWithdrawals, 18)}, Deployed: ${formatUnits(vaultDeployed, 18)}`
  );

  // Calculate secondary-market trade flow attributable to the vault, pinned
  // to the snapshot timestamp like every other DB-derived aggregate.
  const secondaryFlows = await calculateVaultSecondaryFlows(chainId, timestamp);
  console.log(
    `[ProtocolStats] Secondary bought: ${formatUnits(secondaryFlows.bought, 18)}, sold: ${formatUnits(secondaryFlows.sold, 18)}`
  );

  // Calculate airdrops: wUSDe transfers in not explained by deposits,
  // settlement payouts, or secondary sales. Surface a residual diagnostic
  // alongside it so we can spot indexer drift.
  const airdropGains = await calculateVaultAirdrops(chainId, timestamp);
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
    `[ProtocolStats] Airdrop gains: ${formatUnits(airdropGains, 18)} USDe (reconciliation Δ ${formatUnits(reconciliationDelta, 18)})`
  );

  await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
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
  });

  console.log(`[ProtocolStats] Snapshot stored successfully`);
}

/**
 * Get the latest stats snapshot.
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
export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}, vault ${vaultAddress}, interval ${interval}s, phase1-concurrency ${BACKFILL_BLOCK_RESOLUTION_CONCURRENCY}, phase2-concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY}`
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
    // Escrow aggregation is handled inside `sumEscrowBalancesAtBlock`, so we only
    // need the vault config here. Collateral address is still needed for the
    // balance-of vault read.
    const vaultConfig = contracts.predictionMarketVault[chainId];
    const collateralAddress = contracts.collateralToken[chainId]?.address as
      | `0x${string}`
      | undefined;

    // One-shot pre-fetch of every prediction + flow event the per-iter DB
    // aggregators could ever need. Replaces three findMany round-trips per
    // iter (which scaled as N × table_scan) with O(1) sync calls per iter.
    const tAggBuild = performance.now();
    const aggregator = await buildVaultAggregator(chainId);
    console.log(
      `[ProtocolStats] Phase 2 prep: built in-memory aggregator in ${(performance.now() - tAggBuild).toFixed(0)}ms`
    );

    // Pre-launch zero-fills first — just DB upserts, no RPC.
    if (preLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2a: upserting ${preLaunch.length} pre-launch zero-fills...`
      );
      const tPreLaunch = performance.now();
      const preStep = Math.max(1, Math.floor(preLaunch.length / 10));
      await runParallelWork(
        preLaunch,
        BACKFILL_SNAPSHOT_CONCURRENCY,
        async (timestamp) => {
          const t0 = performance.now();
          await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
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
            vaultPositionsWon: 0,
            vaultPositionsLost: 0,
            vaultCollateralWon: 0n,
            vaultCollateralLost: 0n,
          });
          totals.upsert += performance.now() - t0;
          skipCount++;
          if (skipCount % preStep === 0 || skipCount === preLaunch.length) {
            console.log(
              `[ProtocolStats] Phase 2a: ${skipCount}/${preLaunch.length} (${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s)`
            );
          }
        }
      );
      console.log(
        `[ProtocolStats] Phase 2a: done in ${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s`
      );
    }

    // Real on-chain snapshots.
    if (resolved.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2b: fetching on-chain state + DB aggregates for ${resolved.length} snapshots (concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY})...`
      );
    }
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

        const vaultAddr = vaultConfig
          ? getContractForBlock(vaultConfig, blockNumber)
          : null;

        // Three balance reads in parallel — share blockNumber. Escrow sums
        // across current + all past V2 deploys (see sumEscrowBalancesAtBlock),
        // so funds still sitting in old escrow contracts are included.
        // availableAssets() may revert on legacy vaults; fall back to vaultBalance.
        const tRpc = performance.now();
        const [vaultBalance, vaultAvailableAssetsOrNull, escrowBalance] =
          await Promise.all([
            vaultAddr && collateralAddress
              ? client.readContract({
                  address: collateralAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [vaultAddr],
                  blockNumber,
                })
              : Promise.resolve(0n),
            vaultAddr && collateralAddress
              ? client
                  .readContract({
                    address: vaultAddr,
                    abi: predictionMarketVaultAbi,
                    functionName: 'availableAssets',
                    args: [],
                    blockNumber,
                  })
                  .then((v) => v as bigint)
                  .catch(() => null as bigint | null)
              : Promise.resolve(0n as bigint | null),
            sumEscrowBalancesAtBlock(client, chainId, blockNumber),
          ]);
        const rpcMs = performance.now() - tRpc;
        totals.rpcReads += rpcMs;

        const vaultAvailableAssets =
          vaultAvailableAssetsOrNull === null
            ? vaultBalance
            : vaultAvailableAssetsOrNull;

        // DB-derived metrics — sync in-memory aggregation against the
        // pre-fetched superset. Replaces five findMany calls per iter.
        const tDb = performance.now();
        const vaultDeployed = aggregator.deployedAt(timestamp);
        const pnlResult = aggregator.pnlAt(timestamp);
        const flowsResult = aggregator.flowsAt(timestamp);
        const secondaryFlows = aggregator.secondaryAt(timestamp);
        const airdropGains = aggregator.airdropsAt(timestamp);
        const dbMs = performance.now() - tDb;
        totals.dbReads += dbMs;

        const tUpsert = performance.now();
        await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
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
        });
        const upsertMs = performance.now() - tUpsert;
        totals.upsert += upsertMs;

        successCount++;
        doneCount++;
        const iterMs = performance.now() - iterStart;
        console.log(
          `[ProtocolStats] ${dateStr} block=${blockNumber} [${doneCount}/${resolved.length}] ` +
            `iter=${iterMs.toFixed(0)}ms ` +
            `(rpc=${rpcMs.toFixed(0)} db=${dbMs.toFixed(0)} upsert=${upsertMs.toFixed(0)}) | ` +
            `vault=${formatUnits(vaultAvailableAssets, 18)}+${formatUnits(vaultDeployed, 18)} ` +
            `escrow=${formatUnits(escrowBalance, 18)} pnl=${formatUnits(pnlResult.realizedPnL, 18)}`
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
    `[ProtocolStats] Backfill ${verdict}: ${successCount} snapshots processed, ${skipCount} pre-launch zero-fills, ${Math.max(0, postLaunch.length - resolved.length)} skipped in ${(elapsedMs / 1000).toFixed(1)}s\n` +
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
