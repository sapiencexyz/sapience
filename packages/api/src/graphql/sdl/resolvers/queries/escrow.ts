/**
 * Escrow-system queries (9 total):
 *
 *   predictionCount      — count of escrow predictions for an address
 *   positionCount        — count of open token positions for a holder
 *   predictions          — paginated prediction list
 *   prediction           — single lookup by predictionId
 *   pickConfigurations   — paginated picks config list
 *   pickConfiguration    — single lookup by id
 *   positions            — paginated token-balance list with many filters
 *   closes               — paginated burn records
 *   claims               — paginated redemption records
 *
 * The SDL types `Prediction`, `Position`, `Pick`, `PickConfiguration`,
 * `Close`, and `Claim` are all custom object types (NOT direct Prisma
 * models); every resolver below hand-maps the Prisma row to the SDL
 * shape. `mapPickConfig` lives in the shared `pickConfigHelpers.ts`.
 */

import type { QueryResolvers, Prediction } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { mapPickConfig } from '../pickConfigHelpers';

type PredictionWithPickConfig = Prisma.PredictionGetPayload<{
  include: { pickConfiguration: { include: { picks: true } } };
}>;

const mapPrediction = (r: PredictionWithPickConfig): Prediction => ({
  id: r.id,
  predictionId: r.predictionId,
  chainId: r.chainId,
  marketAddress: r.marketAddress,
  predictor: r.predictor,
  counterparty: r.counterparty,
  predictorToken: r.pickConfiguration?.predictorToken ?? '',
  counterpartyToken: r.pickConfiguration?.counterpartyToken ?? '',
  predictorCollateral: r.predictorCollateral,
  counterpartyCollateral: r.counterpartyCollateral,
  collateralDeposited: r.collateralDeposited ?? null,
  collateralDepositedAt: r.collateralDepositedAt ?? null,
  settled: r.settled,
  settledAt: r.settledAt ?? null,
  result: r.result as Prediction['result'],
  predictorClaimable: r.predictorClaimable ?? null,
  counterpartyClaimable: r.counterpartyClaimable ?? null,
  createdAt: r.createdAt,
  createTxHash: r.createTxHash,
  settleTxHash: r.settleTxHash ?? null,
  refCode: r.refCode ?? null,
  isLegacy: r.isLegacy,
  pickConfig: r.pickConfiguration ? mapPickConfig(r.pickConfiguration) : null,
});

export const predictionCount: NonNullable<
  QueryResolvers['predictionCount']
> = async (_parent, { address, chainId }) => {
  const addr = address.toLowerCase();
  const where: Prisma.PredictionWhereInput = {
    OR: [{ predictor: addr }, { counterparty: addr }],
  };
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.prediction.count({ where });
};

export const positionCount: NonNullable<
  QueryResolvers['positionCount']
> = async (_parent, { holder, settled, chainId }) => {
  // Mirror the visibility rule applied in `positions`: drop zero-balance
  // unresolved rows (off-platform transfers/burns) so the count matches the
  // set of underlying positions surfaced to clients.
  const where: Prisma.PositionWhereInput = {
    holder: holder.toLowerCase(),
    NOT: { balance: '0', pickConfiguration: { resolved: false } },
  };
  if (settled !== undefined && settled !== null) {
    where.pickConfiguration = { resolved: settled };
  }
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.position.count({ where });
};

export const predictions: NonNullable<QueryResolvers['predictions']> = async (
  _parent,
  {
    take,
    skip,
    address,
    conditionId,
    chainId,
    settled,
    isLegacy,
    orderBy,
    orderDirection,
  }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const addr = address?.toLowerCase();

  const where: Prisma.PredictionWhereInput = {};
  const filters: Prisma.PredictionWhereInput[] = [];
  if (addr) filters.push({ OR: [{ predictor: addr }, { counterparty: addr }] });
  if (conditionId) {
    const matchingPicks = await prisma.pick.findMany({
      where: {
        conditionId: { equals: conditionId.toLowerCase(), mode: 'insensitive' },
      },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    const pickConfigIds = matchingPicks.map((p) => p.pickConfigId);
    if (pickConfigIds.length === 0) return [];
    filters.push({ pickConfigId: { in: pickConfigIds } });
  }
  if (chainId !== undefined && chainId !== null) filters.push({ chainId });
  if (settled !== undefined && settled !== null) filters.push({ settled });
  if (isLegacy !== undefined && isLegacy !== null) filters.push({ isLegacy });
  if (filters.length > 0) where.AND = filters;

  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  let orderByClause: Prisma.PredictionOrderByWithRelationInput = {
    createdAt: 'desc',
  };
  if (orderBy === 'CREATED_AT') {
    orderByClause = { createdAt: direction };
  } else if (orderBy === 'SETTLED_AT') {
    orderByClause = { settledAt: direction };
  }

  const rows = await prisma.prediction.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake,
    skip,
    include: { pickConfiguration: { include: { picks: true } } },
  });
  return rows.map(mapPrediction);
};

export const prediction: NonNullable<QueryResolvers['prediction']> = async (
  _parent,
  { id }
) => {
  const r = await prisma.prediction.findUnique({
    where: { predictionId: id.toLowerCase() },
    include: { pickConfiguration: { include: { picks: true } } },
  });
  return r ? mapPrediction(r) : null;
};

export const pickConfigurations: NonNullable<
  QueryResolvers['pickConfigurations']
> = async (_parent, { take, skip, chainId, resolved, result, tokens }) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const where: Prisma.PicksWhereInput = {};
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (resolved !== undefined && resolved !== null) where.resolved = resolved;
  if (result) {
    where.result = result as unknown as Prisma.EnumSettlementResultFilter;
  }
  if (tokens && tokens.length > 0) {
    if (tokens.length > 100) {
      throw new Error('tokens filter limited to 100 addresses');
    }
    const lowered = tokens.map((t) => t.toLowerCase());
    where.OR = [
      { predictorToken: { in: lowered } },
      { counterpartyToken: { in: lowered } },
    ];
  }
  const rows = await prisma.picks.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: cappedTake,
    skip,
    include: { picks: true },
  });
  return rows.map((r) => mapPickConfig(r));
};

export const pickConfiguration: NonNullable<
  QueryResolvers['pickConfiguration']
> = async (_parent, { id }) => {
  const r = await prisma.picks.findUnique({
    where: { id: id.toLowerCase() },
    include: { picks: true },
  });
  return r ? mapPickConfig(r) : null;
};

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  {
    holder,
    conditionId,
    take,
    skip,
    chainId,
    pickConfigId,
    settled,
    result,
    endsAtMin,
    endsAtMax,
    holderWon,
    collateralMin,
    collateralMax,
    orderBy,
    orderDirection,
  }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const holderLower = holder?.toLowerCase();
  const pickConfigIdLower = pickConfigId?.toLowerCase();

  const where: Prisma.PositionWhereInput = {};

  if (holderLower) where.holder = holderLower;

  if (conditionId) {
    const matchingPicks = await prisma.pick.findMany({
      where: {
        conditionId: { equals: conditionId.toLowerCase(), mode: 'insensitive' },
      },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    const pickConfigIds = matchingPicks.map((p) => p.pickConfigId);
    if (pickConfigIds.length === 0) return [];
    where.pickConfigId = { in: pickConfigIds };
  }

  // Require at least one filter — prevents accidentally-unbounded queries.
  if (!holderLower && !conditionId && !pickConfigIdLower) return [];

  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (pickConfigIdLower && !conditionId) where.pickConfigId = pickConfigIdLower;
  if (settled !== undefined && settled !== null) {
    where.pickConfiguration = {
      ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
      resolved: settled,
    };
  }
  if (result) {
    where.pickConfiguration = {
      ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
      result: result as unknown as Prisma.EnumSettlementResultFilter,
    };
  }
  if (endsAtMin !== undefined || endsAtMax !== undefined) {
    const endsAtFilter: Record<string, number> = {};
    if (endsAtMin !== undefined && endsAtMin !== null) {
      endsAtFilter.gte = endsAtMin;
    }
    if (endsAtMax !== undefined && endsAtMax !== null) {
      endsAtFilter.lte = endsAtMax;
    }
    where.pickConfiguration = {
      ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
      endsAt: endsAtFilter,
    };
  }

  // Won/lost filter: combines position side (isPredictorToken) with
  // settlement result. Extracted PC conditions apply inside each OR branch
  // so spread ordering doesn't matter.
  if (holderWon !== undefined && holderWon !== null) {
    const basePc = (where.pickConfiguration as Prisma.PicksWhereInput) ?? {};
    delete where.pickConfiguration;
    const [winResult, loseResult] = holderWon
      ? ['PREDICTOR_WINS', 'COUNTERPARTY_WINS']
      : ['COUNTERPARTY_WINS', 'PREDICTOR_WINS'];
    where.OR = [
      {
        isPredictorToken: true,
        pickConfiguration: {
          ...basePc,
          result: winResult as unknown as Prisma.EnumSettlementResultFilter,
        },
      },
      {
        isPredictorToken: false,
        pickConfiguration: {
          ...basePc,
          result: loseResult as unknown as Prisma.EnumSettlementResultFilter,
        },
      },
    ];
  }

  // Collateral range: pre-query pickConfigIds where holder's collateral is
  // in range via a raw UNION grouped by side (predictor vs counterparty).
  if (holderLower && (collateralMin || collateralMax)) {
    const minVal = collateralMin ? BigInt(collateralMin) : 0n;
    const maxVal = collateralMax ? BigInt(collateralMax) : null;
    interface PickConfigRow {
      pickConfigId: string;
      is_predictor: boolean;
    }
    const matchingConfigs = await prisma.$queryRaw<PickConfigRow[]>`
      SELECT "pickConfigId", true AS is_predictor
      FROM "Prediction"
      WHERE predictor = ${holderLower} AND "pickConfigId" IS NOT NULL
      GROUP BY "pickConfigId"
      HAVING SUM(CAST("predictorCollateral" AS DECIMAL)) >= ${minVal.toString()}::DECIMAL
        ${maxVal !== null ? Prisma.sql`AND SUM(CAST("predictorCollateral" AS DECIMAL)) <= ${maxVal.toString()}::DECIMAL` : Prisma.empty}
      UNION
      SELECT "pickConfigId", false AS is_predictor
      FROM "Prediction"
      WHERE counterparty = ${holderLower} AND "pickConfigId" IS NOT NULL
      GROUP BY "pickConfigId"
      HAVING SUM(CAST("counterpartyCollateral" AS DECIMAL)) >= ${minVal.toString()}::DECIMAL
        ${maxVal !== null ? Prisma.sql`AND SUM(CAST("counterpartyCollateral" AS DECIMAL)) <= ${maxVal.toString()}::DECIMAL` : Prisma.empty}
    `;
    if (matchingConfigs.length === 0) return [];
    const validPickConfigIds = matchingConfigs.map((r) => r.pickConfigId);
    if (
      where.pickConfigId &&
      typeof where.pickConfigId === 'object' &&
      'in' in where.pickConfigId
    ) {
      const existing = where.pickConfigId.in as string[];
      where.pickConfigId = {
        in: existing.filter((id) => validPickConfigIds.includes(id)),
      };
    } else if (where.pickConfigId && typeof where.pickConfigId === 'string') {
      if (!validPickConfigIds.includes(where.pickConfigId)) return [];
    } else {
      where.pickConfigId = { in: validPickConfigIds };
    }
  }

  // PositionSortField SDL enum values are CREATED_AT / UPDATED_AT; map
  // to the Prisma column name for orderBy.
  const posOrderDirection = orderDirection === 'asc' ? 'asc' : 'desc';
  const posOrderField = orderBy === 'CREATED_AT' ? 'createdAt' : 'updatedAt';
  const orderByClause: Prisma.PositionOrderByWithRelationInput = {
    [posOrderField]: posOrderDirection,
  };

  const rows = await prisma.position.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake,
    skip,
    include: {
      pickConfiguration: { include: { picks: true, predictions: true } },
    },
  });

  // For each Position row we build a chronological event stream of primary
  // mints (Predictions) and secondary trades (buys + sells matching
  // token+holder), then walk it with running WAC. Each sell produces a
  // synthetic Closed row; if balance > 0 at the end, we also emit an Open
  // row carrying the remaining cost basis. Claims are intentionally excluded
  // — the contract reverts redeem() unless the pickConfig is resolved, so
  // any Claim is post-settlement and the existing settlement-PnL flow on a
  // resolved Position already covers it.
  const chainIds = Array.from(new Set(rows.map((r) => r.chainId)));
  const tokenAddresses = Array.from(new Set(rows.map((r) => r.tokenAddress)));
  const holders = Array.from(new Set(rows.map((r) => r.holder)));
  const trades =
    rows.length === 0
      ? []
      : await prisma.secondaryTrade.findMany({
          where: {
            chainId: { in: chainIds },
            token: { in: tokenAddresses },
            OR: [{ seller: { in: holders } }, { buyer: { in: holders } }],
          },
          select: {
            chainId: true,
            token: true,
            seller: true,
            buyer: true,
            price: true,
            tokenAmount: true,
            executedAt: true,
            tradeHash: true,
          },
        });

  const positionKey = (chainId: number, token: string, holder: string) =>
    `${chainId}:${token}:${holder}`;
  const tradesByPos = new Map<string, typeof trades>();
  for (const t of trades) {
    for (const role of [t.seller, t.buyer] as const) {
      const k = positionKey(t.chainId, t.token, role);
      const arr = tradesByPos.get(k);
      if (arr) arr.push(t);
      else tradesByPos.set(k, [t]);
    }
  }

  type PositionShape = {
    id: string;
    chainId: number;
    tokenAddress: string;
    pickConfigId: string;
    isPredictorToken: boolean;
    holder: string;
    balance: string;
    userCollateral: string | null;
    totalPayout: string | null;
    realizedPnL: string | null;
    createdAt: Date;
    updatedAt: Date;
    pickConfig: ReturnType<typeof mapPickConfig> | null;
  };

  const synthesized: PositionShape[] = [];
  for (const r of rows) {
    const pc = r.pickConfiguration;
    let totalPayout = 0n;
    let predictionId: string | null = null;

    // Primary-mint events from Predictions tied to this position
    type Acquire = { ts: number; cost: bigint; shares: bigint };
    type Disposal = {
      tradeHash: string;
      ts: number;
      proceeds: bigint;
      shares: bigint;
    };
    const acquires: Acquire[] = [];
    const disposals: Disposal[] = [];

    if (pc) {
      for (const pred of pc.predictions) {
        const predCollateral = BigInt(pred.predictorCollateral);
        const cpCollateral = BigInt(pred.counterpartyCollateral);
        const predictionTotal = predCollateral + cpCollateral;
        const isHolderSide =
          (r.isPredictorToken && pred.predictor === r.holder) ||
          (!r.isPredictorToken && pred.counterparty === r.holder);
        if (!isHolderSide) continue;
        predictionId ??= pred.predictionId;
        totalPayout += predictionTotal;
        // Mint amount on both sides equals total collateral pool (see
        // PredictionMarketEscrow.sol). Cost is just the holder's share.
        const cost = r.isPredictorToken ? predCollateral : cpCollateral;
        acquires.push({
          ts: pred.createdAt.getTime() / 1000,
          cost,
          shares: predictionTotal,
        });
      }
    }

    const k = positionKey(r.chainId, r.tokenAddress, r.holder);
    for (const t of tradesByPos.get(k) ?? []) {
      const price = BigInt(t.price);
      const shares = BigInt(t.tokenAmount);
      if (t.buyer === r.holder) {
        acquires.push({ ts: t.executedAt, cost: price, shares });
      }
      if (t.seller === r.holder) {
        disposals.push({
          tradeHash: t.tradeHash,
          ts: t.executedAt,
          proceeds: price,
          shares,
        });
      }
    }

    const acquiresSorted = [...acquires].sort((a, b) => a.ts - b.ts);
    const disposalsSorted = [...disposals].sort((a, b) => a.ts - b.ts);

    // Walk acquires + disposals in chronological order, maintaining running
    // WAC. Each disposal records the cost basis allocated to its shares
    // using the WAC at that moment.
    let costPool = 0n;
    let sharesPool = 0n;
    let acqIdx = 0;
    type DisposalRow = {
      tradeHash: string;
      ts: number;
      proceeds: bigint;
      shares: bigint;
      costBasis: bigint;
    };
    const disposalRows: DisposalRow[] = [];
    for (const d of disposalsSorted) {
      while (
        acqIdx < acquiresSorted.length &&
        acquiresSorted[acqIdx].ts <= d.ts
      ) {
        costPool += acquiresSorted[acqIdx].cost;
        sharesPool += acquiresSorted[acqIdx].shares;
        acqIdx += 1;
      }
      const allocated =
        sharesPool > 0n ? (costPool * d.shares) / sharesPool : 0n;
      disposalRows.push({ ...d, costBasis: allocated });
      costPool -= allocated;
      sharesPool -= d.shares;
      if (sharesPool < 0n) sharesPool = 0n;
      if (costPool < 0n) costPool = 0n;
    }
    while (acqIdx < acquiresSorted.length) {
      costPool += acquiresSorted[acqIdx].cost;
      sharesPool += acquiresSorted[acqIdx].shares;
      acqIdx += 1;
    }

    const totalUserCollateral = acquires.reduce((s, a) => s + a.cost, 0n);
    const totalPayoutStr = totalPayout > 0n ? totalPayout.toString() : null;
    const mappedPickConfig = pc ? mapPickConfig(pc, { predictionId }) : null;
    const balanceBn = BigInt(r.balance);
    const isResolved = pc?.resolved ?? false;

    // Emit one synthetic row per sell (only meaningful for unresolved
    // pickConfigs — once settled, the existing PnL flow takes over).
    if (!isResolved) {
      for (const d of disposalRows) {
        synthesized.push({
          id: `${r.id}-sell-${d.tradeHash}`,
          chainId: r.chainId,
          tokenAddress: r.tokenAddress,
          pickConfigId: r.pickConfigId,
          isPredictorToken: r.isPredictorToken,
          holder: r.holder,
          balance: '0',
          userCollateral: d.costBasis.toString(),
          totalPayout: totalPayoutStr,
          realizedPnL: (d.proceeds - d.costBasis).toString(),
          createdAt: r.createdAt,
          updatedAt: new Date(d.ts * 1000),
          pickConfig: mappedPickConfig,
        });
      }
    }

    // Open / parent row: keep when there's still balance, or when the
    // position is settled (existing settlement-PnL flow handles it). A
    // zero-balance unresolved row with no sells means the holder transferred
    // or burned the tokens off-platform — drop it, matching prior behavior.
    if (balanceBn > 0n || isResolved) {
      const remainingCost =
        !isResolved && disposalRows.length > 0 ? costPool : totalUserCollateral;
      synthesized.push({
        id: String(r.id),
        chainId: r.chainId,
        tokenAddress: r.tokenAddress,
        pickConfigId: r.pickConfigId,
        isPredictorToken: r.isPredictorToken,
        holder: r.holder,
        balance: r.balance,
        userCollateral: remainingCost > 0n ? remainingCost.toString() : null,
        totalPayout: totalPayoutStr,
        realizedPnL: null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        pickConfig: mappedPickConfig,
      });
    }
  }

  // Re-sort by the requested field. Synthetic sell rows carry the trade's
  // executedAt as their updatedAt, so without this they'd appear grouped
  // under their parent Position rather than interleaved by recency.
  const sortKey: keyof Pick<PositionShape, 'createdAt' | 'updatedAt'> =
    posOrderField === 'createdAt' ? 'createdAt' : 'updatedAt';
  synthesized.sort((a, b) => {
    const diff = b[sortKey].getTime() - a[sortKey].getTime();
    return posOrderDirection === 'asc' ? -diff : diff;
  });
  return synthesized;
};

export const closes: NonNullable<QueryResolvers['closes']> = async (
  _parent,
  { take, skip, address, pickConfigId, chainId }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const addr = address?.toLowerCase();
  const pickConfigIdLower = pickConfigId?.toLowerCase();
  const where: Prisma.CloseWhereInput = {};
  if (addr) {
    where.OR = [{ predictorHolder: addr }, { counterpartyHolder: addr }];
  }
  if (pickConfigIdLower) where.pickConfigId = pickConfigIdLower;
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (!addr && !pickConfigIdLower) return [];
  const rows = await prisma.close.findMany({
    where,
    orderBy: { burnedAt: 'desc' },
    take: cappedTake,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    chainId: r.chainId,
    marketAddress: r.marketAddress,
    pickConfigId: r.pickConfigId,
    predictorHolder: r.predictorHolder,
    counterpartyHolder: r.counterpartyHolder,
    predictorTokensBurned: r.predictorTokensBurned,
    counterpartyTokensBurned: r.counterpartyTokensBurned,
    predictorPayout: r.predictorPayout,
    counterpartyPayout: r.counterpartyPayout,
    burnedAt: r.burnedAt,
    txHash: r.txHash,
    refCode: r.refCode ?? null,
  }));
};

export const claims: NonNullable<QueryResolvers['claims']> = async (
  _parent,
  { take, skip, holder, predictionId, chainId }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const holderLower = holder?.toLowerCase();
  const predictionIdLower = predictionId?.toLowerCase();
  const where: Prisma.ClaimWhereInput = {};
  if (holderLower) where.holder = holderLower;
  if (predictionIdLower) where.predictionId = predictionIdLower;
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (!holderLower && !predictionIdLower) return [];
  const rows = await prisma.claim.findMany({
    where,
    orderBy: { redeemedAt: 'desc' },
    take: cappedTake,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    chainId: r.chainId,
    marketAddress: r.marketAddress,
    predictionId: r.predictionId,
    holder: r.holder,
    positionToken: r.positionToken,
    tokensBurned: r.tokensBurned,
    collateralPaid: r.collateralPaid,
    redeemedAt: r.redeemedAt,
    txHash: r.txHash,
    refCode: r.refCode ?? null,
  }));
};
