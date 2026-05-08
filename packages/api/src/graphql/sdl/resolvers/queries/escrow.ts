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

import type {
  QueryResolvers,
  QueryPickConfigurationsArgs,
  QueryPositionsArgs,
  QueryPredictionsArgs,
  Prediction,
  ResolversParentTypes,
} from '../../__generated__/resolvers';
import type { ApolloContext } from '../../../startApolloServer';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { mapPickConfig } from '../pickConfigHelpers';
import { preloadPickConditions } from '../preloadPickConditions';
import { TtlCache } from '../../../../lib/ttlCache';
import { clampSkip, clampTake } from './pagination';

type PredictionWithPickConfig = Prisma.PredictionGetPayload<{
  include: { pickConfiguration: { include: { picks: true } } };
}>;

const mapPrediction = (
  r: PredictionWithPickConfig
): ResolversParentTypes['Prediction'] => ({
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

export type PredictionsPageEnvelope = {
  items: ResolversParentTypes['Prediction'][];
  hasMore: boolean;
  /**
   * Eagerly populated only on early-return paths where the count is
   * already known (empty pickConfigIds → 0). On the normal path, this
   * is null and `_countWhere` carries the filter for the lazy
   * PredictionsPage.totalCount field resolver.
   */
  totalCount: number | null;
  /**
   * Lazy count input — used by the PredictionsPage.totalCount field
   * resolver to issue `prisma.prediction.count({ where })` only when
   * the client actually selects totalCount. Avoids paying for a count
   * query on every page request.
   */
  _countWhere?: Prisma.PredictionWhereInput;
};

export const runPredictions = async (
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
  }: QueryPredictionsArgs,
  ctx: ApolloContext | undefined
): Promise<PredictionsPageEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
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
    if (pickConfigIds.length === 0)
      return { items: [], hasMore: false, totalCount: 0 };
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

  const rawRows = await prisma.prediction.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake + 1,
    skip: skipVal,
    include: { pickConfiguration: { include: { picks: true } } },
  });
  const hasMore = rawRows.length > cappedTake;
  const rows = rawRows.slice(0, cappedTake);
  await preloadPickConditions(
    ctx,
    rows.map((r) => r.pickConfiguration)
  );
  return {
    items: rows.map(mapPrediction),
    hasMore,
    totalCount: null,
    _countWhere: where,
  };
};

export const predictionsPage: NonNullable<
  QueryResolvers['predictionsPage']
> = async (_parent, args, ctx) => {
  return runPredictions(args, ctx);
};

export const prediction: NonNullable<QueryResolvers['prediction']> = async (
  _parent,
  { id },
  ctx
) => {
  const r = await prisma.prediction.findUnique({
    where: { predictionId: id.toLowerCase() },
    include: { pickConfiguration: { include: { picks: true } } },
  });
  if (r) await preloadPickConditions(ctx, [r.pickConfiguration]);
  return r ? mapPrediction(r) : null;
};

export const runPickConfigurations = async (
  {
    take,
    skip,
    chainId,
    resolved,
    result,
    tokens,
  }: QueryPickConfigurationsArgs,
  ctx: ApolloContext | undefined
): Promise<{
  items: ReturnType<typeof mapPickConfig>[];
  hasMore: boolean;
}> => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
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
  const rawRows = await prisma.picks.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: cappedTake + 1,
    skip: skipVal,
    include: { picks: true },
  });
  const hasMore = rawRows.length > cappedTake;
  const rows = rawRows.slice(0, cappedTake);
  await preloadPickConditions(ctx, rows);
  return { items: rows.map((r) => mapPickConfig(r)), hasMore };
};

export const pickConfigurationsPage: NonNullable<
  QueryResolvers['pickConfigurationsPage']
> = async (_parent, args, ctx) => {
  return runPickConfigurations(args, ctx);
};

type PositionShape = ResolversParentTypes['Position'] & {
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

/**
 * Per-position synthesis cache. The synthesized event-stream rows for
 * a Position depend on its trade history + the pickConfiguration's
 * predictions; both are append-only and overlap heavily across page
 * requests. Keying on `Position.updatedAt.getTime()` invalidates
 * automatically when the indexer touches the row (mint, burn, balance
 * change). The 30s TTL bounds staleness for the indirect path where a
 * fresh secondaryTrade lands without bumping Position.updatedAt — the
 * trade itself surfaces on accountActivityPage immediately; only the
 * derived cost-basis view here lags briefly.
 *
 * maxSize bounds memory: each entry is 1-2 small objects per held
 * position. 10_000 covers ~all active holders across both chains.
 */
const positionSynthesisCache = new TtlCache<string, PositionShape[]>({
  ttlMs: 30_000,
  maxSize: 10_000,
});

const positionSynthesisCacheKey = (r: {
  chainId: number;
  tokenAddress: string;
  holder: string;
  updatedAt: Date;
}) => `${r.chainId}:${r.tokenAddress}:${r.holder}:${r.updatedAt.getTime()}`;

/** Test-only: clear synthesis cache between test cases. */
export const __clearPositionSynthesisCache = () =>
  positionSynthesisCache.clear();

export type PositionsPageEnvelope = {
  items: PositionShape[];
  hasMore: boolean;
  totalCount: number | null;
  _countWhere?: Prisma.PositionWhereInput;
};

export const runPositions = async (
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
  }: QueryPositionsArgs,
  ctx: ApolloContext | undefined
): Promise<PositionsPageEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
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
    if (pickConfigIds.length === 0)
      return { items: [], hasMore: false, totalCount: 0 };
    where.pickConfigId = { in: pickConfigIds };
  }

  // Require at least one filter — prevents accidentally-unbounded queries.
  if (!holderLower && !conditionId && !pickConfigIdLower)
    return { items: [], hasMore: false, totalCount: 0 };

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
    if (matchingConfigs.length === 0)
      return { items: [], hasMore: false, totalCount: 0 };
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
      if (!validPickConfigIds.includes(where.pickConfigId))
        return { items: [], hasMore: false, totalCount: 0 };
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

  // The PickConfiguration → Prediction relation is many-to-many in spirit:
  // any user who has predicted on this market shows up here. We only need
  // the rows where the holder is a counterparty to compute their cost
  // basis, so push the filter into the include and avoid pulling every
  // other user's prediction back over the wire. When `holder` isn't
  // pinned (conditionId / pickConfigId path), keep the full set.
  const predictionsInclude: Prisma.Picks$predictionsArgs | true = holderLower
    ? {
        where: {
          OR: [{ predictor: holderLower }, { counterparty: holderLower }],
        },
      }
    : true;

  // Fetch take+1 to detect a `hasMore`-style next page without a count
  // query for pagination. Synthesized event-stream rows from raw
  // positions can be empty (zero-balance unresolved with no sells), so
  // client-side `lastPage.length === 0` is unreliable as a stop signal
  // — we need server-truth pagination.
  //
  // `totalCount` is left null here; the PositionsPage.totalCount field
  // resolver lazily issues `prisma.position.count({ where })` only when
  // the client actually selects the field. The deprecated `positions`
  // wrapper discards totalCount entirely, so it now skips the count
  // query for free.
  const rawRows = await prisma.position.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake + 1,
    skip: skipVal,
    include: {
      pickConfiguration: {
        include: { picks: true, predictions: predictionsInclude },
      },
    },
  });
  const hasMore = rawRows.length > cappedTake;
  const rows = rawRows.slice(0, cappedTake);

  // For each Position row we build a chronological event stream of primary
  // mints (Predictions) and secondary trades (buys + sells matching
  // token+holder), then walk it with running WAC. Each sell produces a
  // synthetic Closed row; if balance > 0 at the end, we also emit an Open
  // row carrying the remaining cost basis. Claims are intentionally excluded
  // — the contract reverts redeem() unless the pickConfig is resolved, so
  // any Claim is post-settlement and the existing settlement-PnL flow on a
  // resolved Position already covers it.
  type RowT = (typeof rows)[number];
  type TradeRow = {
    chainId: number;
    token: string;
    seller: string;
    buyer: string;
    price: string;
    tokenAmount: string;
    executedAt: number;
    tradeHash: string;
  };

  // Split rows into cache hits and misses. Hits skip both the trades
  // fetch and the WAC walk; misses go through the full pipeline below.
  const cachedByRow = new Map<RowT, PositionShape[]>();
  const missedRows: RowT[] = [];
  for (const r of rows) {
    const cached = positionSynthesisCache.get(positionSynthesisCacheKey(r));
    if (cached) cachedByRow.set(r, cached);
    else missedRows.push(r);
  }

  // preloadPickConditions still runs against the full page so per-Pick
  // condition resolvers stay warm regardless of cache state. The trades
  // fetch is scoped to misses only — hits are reused as-is.
  const missChainIds = Array.from(new Set(missedRows.map((r) => r.chainId)));
  const missTokens = Array.from(new Set(missedRows.map((r) => r.tokenAddress)));
  const missHolders = Array.from(new Set(missedRows.map((r) => r.holder)));
  const [, trades] = await Promise.all([
    preloadPickConditions(
      ctx,
      rows.map((r) => r.pickConfiguration)
    ),
    missedRows.length === 0
      ? Promise.resolve([] as TradeRow[])
      : prisma.secondaryTrade.findMany({
          where: {
            chainId: { in: missChainIds },
            token: { in: missTokens },
            OR: [
              { seller: { in: missHolders } },
              { buyer: { in: missHolders } },
            ],
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
        }),
  ]);

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

  const synthesized: PositionShape[] = [];
  for (const r of rows) {
    const cached = cachedByRow.get(r);
    if (cached) {
      synthesized.push(...cached);
      continue;
    }

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

    // Collect this row's synthesized output so the cache can store the
    // exact same set we push into the page result.
    const rowSynthesized: PositionShape[] = [];

    // Emit one synthetic row per sell (only meaningful for unresolved
    // pickConfigs — once settled, the existing PnL flow takes over).
    if (!isResolved) {
      for (const d of disposalRows) {
        rowSynthesized.push({
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
      rowSynthesized.push({
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

    positionSynthesisCache.set(positionSynthesisCacheKey(r), rowSynthesized);
    synthesized.push(...rowSynthesized);
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
  return { items: synthesized, hasMore, totalCount: null, _countWhere: where };
};

export const positionsPage: NonNullable<
  QueryResolvers['positionsPage']
> = async (_parent, args, ctx) => {
  return runPositions(args, ctx);
};
