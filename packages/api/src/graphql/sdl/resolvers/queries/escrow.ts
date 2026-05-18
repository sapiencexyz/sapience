/**
 * Escrow-system queries (9 total):
 *
 *   predictionCount      — count of escrow predictions for an address
 *   positionCount        — count of open token positions for a holder
 *   predictions          — paginated prediction list
 *   prediction           — single lookup by predictionId
 *   pickConfigurations   — paginated picks config list
 *   pickConfiguration    — single lookup by id
 *   positions            — paginated token-balance list with many filters (deprecated; see `queries/deprecated/escrow.ts`)
 *   positionsPage        — same data, server-truth `hasMore` + lazy `totalCount`
 *   closes               — paginated burn records
 *   claims               — paginated redemption records
 *
 * The SDL types `Prediction`, `Position`, `Pick`, `PickConfiguration`,
 * `Close`, and `Claim` are all custom object types (NOT direct Prisma
 * models); every resolver below hand-maps the Prisma row to the SDL
 * shape. `mapPickConfig` lives in the shared `pickConfigHelpers.ts`.
 *
 * `runPositions` is the most involved resolver — it builds a Prisma
 * where, runs an optional collateral-range pre-query, fetches a page of
 * Positions, then synthesizes a per-position event stream (mints +
 * trades, walked with running WAC) into one or more output rows. It is
 * decomposed into focused helpers so each step is inspectable in
 * isolation:
 *
 *   normalizePositionsArgs   → clamp + lowercase
 *   buildPositionsWhere      → conditionId pre-resolve + filter merge
 *   applyCollateralRange     → raw-SQL UNION of in-range pickConfigIds
 *   synthesizePositionsPage  → cache split + trade fetch + WAC walk
 *   sortSynthesizedRows      → final interleaved sort
 */

import type {
  QueryResolvers,
  QueryPickConfigurationsArgs,
  QueryPickConfigurationsPageArgs,
  QueryPositionsArgs,
  QueryPositionsPageArgs,
  QueryPredictionsArgs,
  QueryPredictionsPageArgs,
  BigIntFilter,
  Prediction,
  ResolversParentTypes,
  SettlementResult,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { mapPickConfig } from '../pickConfigHelpers';
import { TtlCache } from '../../../../lib/ttlCache';
import { logDeprecatedHit } from '../../../../lib/deprecationTelemetry';
import { clampSkip, clampTake } from './pagination';

/**
 * Parsed `BigIntFilter` (operator-pattern numeric filter input). All
 * operators combine with AND. Only the supported subset is represented
 * here; unsupported operators (`in`, `notIn`, `not`) are rejected at
 * parse time so they never reach SQL generation.
 */
type ParsedBigIntFilter = {
  equals?: bigint;
  gt?: bigint;
  gte?: bigint;
  lt?: bigint;
  lte?: bigint;
};

const BIGINT_FILTER_SUPPORTED_OPS = [
  'equals',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;
const BIGINT_FILTER_UNSUPPORTED_OPS = ['in', 'notIn', 'not'] as const;

/**
 * Parse a GraphQL `BigIntFilter` input into a `ParsedBigIntFilter`.
 * Returns `null` when the filter is unset or has no narrowing operator.
 * Throws on unsupported operators (`in`/`notIn`/`not`) and on values
 * that don't coerce to bigint — invalid input is a programming error
 * and shouldn't silently degrade.
 *
 * `fieldName` is interpolated into error messages so the client knows
 * which input was rejected (e.g. `balance.gte`, `collateral.lte`).
 */
const parseBigIntFilter = (
  raw: BigIntFilter | null | undefined,
  fieldName: string
): ParsedBigIntFilter | null => {
  if (!raw) return null;
  for (const op of BIGINT_FILTER_UNSUPPORTED_OPS) {
    if (raw[op] != null) {
      throw new Error(
        `${fieldName}: \`${op}\` is not supported. Use \`equals\`, \`gt\`, \`gte\`, \`lt\`, or \`lte\`.`
      );
    }
  }
  const out: ParsedBigIntFilter = {};
  for (const op of BIGINT_FILTER_SUPPORTED_OPS) {
    const v = raw[op];
    if (v == null) continue;
    try {
      out[op] = BigInt(v as string | number | bigint);
    } catch {
      throw new Error(
        `${fieldName}.${op}: expected an integer value; got ${String(v)}`
      );
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};

/**
 * Build a `ParsedBigIntFilter` from the deprecated flat
 * `<field>Min` / `<field>Max` string args. Returns `null` when both
 * are empty/null. Malformed strings are silently ignored (lenient
 * legacy semantics — these args are on their way out).
 */
const flatRangeToFilter = (
  min: string | null | undefined,
  max: string | null | undefined
): ParsedBigIntFilter | null => {
  if (!min && !max) return null;
  const out: ParsedBigIntFilter = {};
  if (min) {
    try {
      out.gte = BigInt(min);
    } catch {
      /* malformed — ignore */
    }
  }
  if (max) {
    try {
      out.lte = BigInt(max);
    } catch {
      /* malformed — ignore */
    }
  }
  return out.gte !== undefined || out.lte !== undefined ? out : null;
};

/**
 * Evaluate a parsed filter against a value in JS. Used for filtering
 * synthesized rows that don't reach SQL (per-sell CLOSED rows with
 * `balance: '0'`).
 */
const evalBigIntFilter = (
  filter: ParsedBigIntFilter | null,
  value: bigint
): boolean => {
  if (!filter) return true;
  if (filter.equals !== undefined && value !== filter.equals) return false;
  if (filter.gt !== undefined && !(value > filter.gt)) return false;
  if (filter.gte !== undefined && !(value >= filter.gte)) return false;
  if (filter.lt !== undefined && !(value < filter.lt)) return false;
  if (filter.lte !== undefined && !(value <= filter.lte)) return false;
  return true;
};

/**
 * Render a parsed filter to a list of SQL fragments comparing the
 * given column expression against decimal-cast wei literals. Returns
 * an empty list when the filter has no narrowing operator. Callers
 * `AND` the fragments into the surrounding WHERE.
 */
const renderBigIntFilterToSql = (
  filter: ParsedBigIntFilter,
  columnExpr: Prisma.Sql
): Prisma.Sql[] => {
  const parts: Prisma.Sql[] = [];
  if (filter.equals !== undefined) {
    parts.push(
      Prisma.sql`${columnExpr} = ${filter.equals.toString()}::DECIMAL`
    );
  }
  if (filter.gt !== undefined) {
    parts.push(Prisma.sql`${columnExpr} > ${filter.gt.toString()}::DECIMAL`);
  }
  if (filter.gte !== undefined) {
    parts.push(Prisma.sql`${columnExpr} >= ${filter.gte.toString()}::DECIMAL`);
  }
  if (filter.lt !== undefined) {
    parts.push(Prisma.sql`${columnExpr} < ${filter.lt.toString()}::DECIMAL`);
  }
  if (filter.lte !== undefined) {
    parts.push(Prisma.sql`${columnExpr} <= ${filter.lte.toString()}::DECIMAL`);
  }
  return parts;
};

/**
 * Stable JSON key for a parsed filter — used in cache keys where the
 * filter discriminates output (synthesized CLOSED rows depend on
 * whether `0n` satisfies the filter, and balance filters can also
 * suppress otherwise-valid synthesized rows).
 */
const filterCacheKey = (filter: ParsedBigIntFilter | null): string => {
  if (!filter) return '-';
  return BIGINT_FILTER_SUPPORTED_OPS.map((op) => {
    const v = filter[op];
    return v === undefined ? '' : `${op}:${v.toString()}`;
  })
    .filter(Boolean)
    .join(',');
};

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

/**
 * Extended args for `runPredictions` — superset of the deprecated bare
 * `predictions(...)` args. The richer filter fields (`result`,
 * `endsAtMin`/`Max`) live only on `predictionsPage` / `PredictionFilters`.
 */
export type RunPredictionsArgs = QueryPredictionsArgs & {
  result?: SettlementResult | null;
  endsAtMin?: number | null;
  endsAtMax?: number | null;
};

export const runPredictions = async ({
  take,
  skip,
  address,
  conditionId,
  chainId,
  settled,
  isLegacy,
  result,
  endsAtMin,
  endsAtMax,
  orderBy,
  orderDirection,
}: RunPredictionsArgs): Promise<PredictionsPageEnvelope> => {
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
  // result / endsAt range filters live on the pickConfig join.
  if (result) {
    filters.push({
      pickConfiguration: {
        result: result as unknown as Prisma.EnumSettlementResultFilter,
      },
    });
  }
  if (endsAtMin != null || endsAtMax != null) {
    const range: Prisma.IntFilter = {};
    if (endsAtMin != null) range.gte = endsAtMin;
    if (endsAtMax != null) range.lte = endsAtMax;
    filters.push({ pickConfiguration: { endsAt: range } });
  }
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
  return {
    items: rows.map(mapPrediction),
    hasMore,
    totalCount: null,
    _countWhere: where,
  };
};

/**
 * Merge `filters: PredictionFilters` (preferred) with the deprecated flat
 * arg shape, so `runPredictions` sees a single canonical set of fields.
 * When a field appears in both, `filters` wins. The richer filters
 * (`result`, `endsAtMin`/`Max`) live only on `PredictionFilters`.
 */
const mergePredictionFilters = (
  args: QueryPredictionsPageArgs
): RunPredictionsArgs => {
  const f = args.filters ?? null;
  return {
    take: args.take,
    skip: args.skip,
    orderBy: args.orderBy,
    orderDirection: args.orderDirection,
    address: f?.address ?? args.address ?? null,
    chainId: f?.chainId ?? args.chainId ?? null,
    conditionId: f?.conditionId ?? args.conditionId ?? null,
    isLegacy: f?.isLegacy ?? args.isLegacy ?? null,
    settled: f?.settled ?? args.settled ?? null,
    result: f?.result ?? null,
    endsAtMin: f?.endsAtMin ?? null,
    endsAtMax: f?.endsAtMax ?? null,
  };
};

export const predictionsPage: NonNullable<
  QueryResolvers['predictionsPage']
> = async (_parent, args) => {
  return runPredictions(mergePredictionFilters(args));
};

export const prediction: NonNullable<QueryResolvers['prediction']> = async (
  _parent,
  { predictionId, id }
) => {
  const key = predictionId ?? id;
  if (!key) {
    throw new Error('prediction: pass `predictionId` (or the deprecated `id`)');
  }
  const r = await prisma.prediction.findUnique({
    where: { predictionId: key.toLowerCase() },
    include: { pickConfiguration: { include: { picks: true } } },
  });
  return r ? mapPrediction(r) : null;
};

export type RunPickConfigurationsArgs = QueryPickConfigurationsArgs & {
  orderBy?: 'CREATED_AT' | 'ENDS_AT' | 'RESOLVED_AT' | null;
  orderDirection?: 'asc' | 'desc' | null;
};

export const runPickConfigurations = async ({
  take,
  skip,
  chainId,
  resolved,
  result,
  tokens,
  orderBy,
  orderDirection,
}: RunPickConfigurationsArgs): Promise<{
  items: ReturnType<typeof mapPickConfig>[];
  hasMore: boolean;
  totalCount: number | null;
  _countWhere?: Prisma.PicksWhereInput;
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
  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderByClause: Prisma.PicksOrderByWithRelationInput =
    orderBy === 'ENDS_AT'
      ? { endsAt: direction }
      : orderBy === 'RESOLVED_AT'
        ? { resolvedAt: direction }
        : { createdAt: direction };
  const rawRows = await prisma.picks.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake + 1,
    skip: skipVal,
    include: { picks: true },
  });
  const hasMore = rawRows.length > cappedTake;
  const rows = rawRows.slice(0, cappedTake);
  return {
    items: rows.map((r) => mapPickConfig(r)),
    hasMore,
    totalCount: null,
    _countWhere: where,
  };
};

/**
 * Merge `filters: PickConfigurationFilters` with the deprecated flat
 * arg shape. `filters` wins on conflicts.
 */
const mergePickConfigurationFilters = (
  args: QueryPickConfigurationsPageArgs
): RunPickConfigurationsArgs => {
  const f = args.filters ?? null;
  return {
    take: args.take,
    skip: args.skip,
    chainId: f?.chainId ?? args.chainId ?? null,
    resolved: f?.resolved ?? args.resolved ?? null,
    result: f?.result ?? args.result ?? null,
    tokens: f?.tokens ?? args.tokens ?? null,
    orderBy: args.orderBy ?? null,
    orderDirection: args.orderDirection ?? null,
  };
};

export const pickConfigurationsPage: NonNullable<
  QueryResolvers['pickConfigurationsPage']
> = async (_parent, args) => {
  return runPickConfigurations(mergePickConfigurationFilters(args));
};

export const pickConfiguration: NonNullable<
  QueryResolvers['pickConfiguration']
> = async (_parent, { id }, ctx) => {
  logDeprecatedHit('pickConfiguration');
  const r = ctx?.loaders
    ? await ctx.loaders.pickConfigById.load(id)
    : await prisma.picks.findUnique({
        where: { id: id.toLowerCase() },
        include: { picks: true },
      });
  return r ? mapPickConfig(r) : null;
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

const positionSynthesisCacheKey = (
  r: {
    chainId: number;
    tokenAddress: string;
    holder: string;
    updatedAt: Date;
  },
  balanceFilter: ParsedBigIntFilter | null
) =>
  // The balance filter changes synthesizer output (CLOSED rows carry
  // `balance: "0"` and are emitted iff `0n` satisfies the filter), so
  // it must be part of the cache key — otherwise a request with one
  // filter can serve another's entry under the same updatedAt and
  // return the wrong row set.
  `${r.chainId}:${r.tokenAddress}:${r.holder}:${r.updatedAt.getTime()}:${filterCacheKey(balanceFilter)}`;

/** Test-only: clear synthesis cache between test cases. */
export const __clearPositionSynthesisCache = () =>
  positionSynthesisCache.clear();

export type PositionsPageEnvelope = {
  items: PositionShape[];
  hasMore: boolean;
  totalCount: number | null;
  _countWhere?: Prisma.PositionWhereInput;
};

/**
 * Extended args for `runPositions` — superset of the deprecated bare
 * `positions(...)` args. The operator-pattern filter inputs
 * (`balance: BigIntFilter`, `collateral: BigIntFilter`) live only on
 * `positionsPage(filters: PositionFilters)` and aren't exposed on the
 * deprecated `positions` query; this internal type carries them
 * through `mergePositionFilters` → `runPositions` → `normalizePositionsArgs`.
 */
export type RunPositionsArgs = QueryPositionsArgs & {
  balance?: BigIntFilter | null;
  collateral?: BigIntFilter | null;
};

type NormalizedPositionsArgs = {
  cappedTake: number;
  skipVal: number;
  holderLower?: string;
  pickConfigIdLower?: string;
  conditionId: string | null;
  chainId: number | null | undefined;
  settled: boolean | null | undefined;
  result: QueryPositionsArgs['result'];
  endsAtMin: number | null | undefined;
  endsAtMax: number | null | undefined;
  holderWon: boolean | null | undefined;
  collateralFilter: ParsedBigIntFilter | null;
  /**
   * Strict numeric filter on `Position.balance` (wei). `null` means no
   * filter — every row matches on this axis. Synthesized CLOSED rows
   * (whose `balance: "0"` event values are constructed in-memory) are
   * filtered against this in `synthesizePositionRow`.
   */
  balanceFilter: ParsedBigIntFilter | null;
  orderField: 'createdAt' | 'updatedAt';
  orderDirection: 'asc' | 'desc';
};

/**
 * Resolve the effective collateral filter: prefer the operator-pattern
 * `collateral: BigIntFilter` when present; fall back to the deprecated
 * flat `collateralMin`/`collateralMax` strings otherwise. The two
 * cannot meaningfully be merged — callers should use one or the other.
 */
const resolveCollateralFilter = (
  args: RunPositionsArgs
): ParsedBigIntFilter | null => {
  const parsed = parseBigIntFilter(args.collateral ?? null, 'collateral');
  if (parsed) return parsed;
  return flatRangeToFilter(args.collateralMin, args.collateralMax);
};

const normalizePositionsArgs = (
  args: RunPositionsArgs
): NormalizedPositionsArgs => ({
  cappedTake: clampTake(args.take, { defaultTake: 50, maxTake: 100 }),
  // Positions uses a 10_000 ceiling rather than the shared
  // `MAX_SKIP = 1_000` default in `./pagination.ts`. Staging was
  // unbounded, so this is purely a defensive safety net: nobody
  // realistically pages past row ~5_000 of their own positions, but
  // an accidental `skip: 5_000_000` would otherwise force Postgres to
  // scan and discard millions of rows. The broader `*Page` refactor
  // will land the uniform 1_000 policy across all paginated queries;
  // we keep positions at 10_000 here so this slice stays close to the
  // previous open-ended behavior.
  skipVal: clampSkip(args.skip, { maxSkip: 10_000 }),
  holderLower: args.holder?.toLowerCase(),
  pickConfigIdLower: args.pickConfigId?.toLowerCase(),
  conditionId: args.conditionId ?? null,
  chainId: args.chainId,
  settled: args.settled,
  result: args.result,
  endsAtMin: args.endsAtMin,
  endsAtMax: args.endsAtMax,
  holderWon: args.holderWon,
  collateralFilter: resolveCollateralFilter(args),
  // `balance: BigIntFilter` is the operator-pattern numeric filter.
  // Strict semantics — see `applyBalanceFilter`. Unsupported operators
  // throw; supported operators (equals/gt/gte/lt/lte) flow through to
  // raw SQL with a DECIMAL cast on the VarChar `Position.balance`.
  balanceFilter: parseBigIntFilter(args.balance ?? null, 'balance'),
  // PositionSortField SDL enum values are CREATED_AT / UPDATED_AT; map
  // to the Prisma column name for orderBy.
  orderField: args.orderBy === 'CREATED_AT' ? 'createdAt' : 'updatedAt',
  orderDirection: args.orderDirection === 'asc' ? 'asc' : 'desc',
});

/**
 * Resolve `conditionId` to the matching pickConfigIds via the join
 * table. Returns null when no pickConfigs match — caller must early-
 * return an empty page (a `pickConfigId IN ()` would match no rows
 * but pay for a useless query).
 */
const resolveConditionPickConfigIds = async (
  conditionId: string
): Promise<string[] | null> => {
  const matchingPicks = await prisma.pick.findMany({
    where: {
      conditionId: { equals: conditionId.toLowerCase(), mode: 'insensitive' },
    },
    select: { pickConfigId: true },
    distinct: ['pickConfigId'],
  });
  if (matchingPicks.length === 0) return null;
  return matchingPicks.map((p) => p.pickConfigId);
};

/**
 * Build the Prisma where for `positions`. Returns `null` when the
 * filter set is empty (no holder / conditionId / pickConfigId) — the
 * resolver requires at least one to avoid unbounded scans.
 *
 * `conditionPickConfigIds` is the optional pre-resolved set from
 * resolveConditionPickConfigIds; when present it scopes pickConfigId
 * to just those ids.
 */
const buildPositionsWhere = (
  args: NormalizedPositionsArgs,
  conditionPickConfigIds: string[] | null
): Prisma.PositionWhereInput | null => {
  const {
    holderLower,
    pickConfigIdLower,
    conditionId,
    chainId,
    settled,
    result,
    endsAtMin,
    endsAtMax,
    holderWon,
  } = args;

  if (!holderLower && !conditionId && !pickConfigIdLower) return null;

  const where: Prisma.PositionWhereInput = {};

  if (holderLower) where.holder = holderLower;
  if (conditionPickConfigIds)
    where.pickConfigId = { in: conditionPickConfigIds };
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (pickConfigIdLower && !conditionId) where.pickConfigId = pickConfigIdLower;
  // `balance` isn't applied here — it requires a numeric comparison
  // against the VarChar `balance` column, which Prisma can't express
  // (its `gte` is lexicographic). `applyBalanceFilter` runs a raw
  // SQL pre-query and constrains the main findMany via `id IN (…)`.

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

  return where;
};

/**
 * Pre-query pickConfigIds where the holder's collateral on the
 * pickConfig satisfies every operator on the filter. Groups raw
 * `Prediction` rows by `pickConfigId` and side (predictor vs
 * counterparty) via a UNION; each branch sums the holder's collateral
 * on that side and applies the operator(s) in the `HAVING` clause.
 * Returns the intersected pickConfigId filter to merge into the where,
 * or `null` to signal "no matching configs — return empty page".
 */
const applyCollateralFilter = async (
  where: Prisma.PositionWhereInput,
  holderLower: string,
  filter: ParsedBigIntFilter
): Promise<Prisma.PositionWhereInput | null> => {
  const predictorConditions = renderBigIntFilterToSql(
    filter,
    Prisma.sql`SUM(CAST("predictorCollateral" AS DECIMAL))`
  );
  const counterpartyConditions = renderBigIntFilterToSql(
    filter,
    Prisma.sql`SUM(CAST("counterpartyCollateral" AS DECIMAL))`
  );
  // `renderBigIntFilterToSql` only returns empty when the parsed filter
  // has no operators; the caller short-circuits on a null filter, so a
  // non-null filter here always produces at least one fragment.
  if (predictorConditions.length === 0) return where;
  const predictorHaving = Prisma.join(predictorConditions, ' AND ');
  const counterpartyHaving = Prisma.join(counterpartyConditions, ' AND ');
  interface PickConfigRow {
    pickConfigId: string;
    is_predictor: boolean;
  }
  const matchingConfigs = await prisma.$queryRaw<PickConfigRow[]>`
    SELECT "pickConfigId", true AS is_predictor
    FROM "Prediction"
    WHERE predictor = ${holderLower} AND "pickConfigId" IS NOT NULL
    GROUP BY "pickConfigId"
    HAVING ${predictorHaving}
    UNION
    SELECT "pickConfigId", false AS is_predictor
    FROM "Prediction"
    WHERE counterparty = ${holderLower} AND "pickConfigId" IS NOT NULL
    GROUP BY "pickConfigId"
    HAVING ${counterpartyHaving}
  `;
  if (matchingConfigs.length === 0) return null;
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
    if (!validPickConfigIds.includes(where.pickConfigId)) return null;
  } else {
    where.pickConfigId = { in: validPickConfigIds };
  }
  return where;
};

/**
 * Strict operator-pattern numeric filter on `Position.balance`. The
 * column is stored as a VarChar of the wei integer (values exceed JS
 * Number precision), so Prisma's native comparators are lexicographic
 * (`'10' < '9'`). Pre-query matching Position IDs via raw SQL with
 * `CAST(... AS DECIMAL)`, then constrain the main findMany via
 * `id IN (…)`.
 *
 * Strict semantics — the row is kept iff its balance satisfies every
 * operator. To include claimed winners (resolved, zero-balance) in
 * the same result set, omit the filter or compose with `settled: true`
 * as a separate query — there is no implicit OR.
 *
 * Returns `null` to signal "no positions match — short-circuit to an
 * empty page" so callers can avoid the downstream findMany/synthesis
 * work.
 */
const applyBalanceFilter = async (
  where: Prisma.PositionWhereInput,
  holderLower: string | undefined,
  filter: ParsedBigIntFilter
): Promise<Prisma.PositionWhereInput | null> => {
  const conditions = renderBigIntFilterToSql(
    filter,
    Prisma.sql`CAST(p.balance AS DECIMAL)`
  );
  // No-op filter (parsed but every operator was undefined) — return
  // the where unchanged. Callers should already have short-circuited
  // on a null parsed filter; this guard is defense in depth.
  if (conditions.length === 0) return where;
  const balanceWhere = Prisma.join(conditions, ' AND ');
  interface IdRow {
    id: number;
  }
  // Scope by holder when present to keep the scan bounded — typical
  // holders carry well under a thousand Position rows. Without a
  // holder, the conditionId / pickConfigId paths already narrow the
  // working set via the main where, so the unscoped variant only
  // runs when the caller has explicitly opened a broader query.
  const rows = holderLower
    ? await prisma.$queryRaw<IdRow[]>`
        SELECT p.id FROM "Position" p
        WHERE p.holder = ${holderLower}
          AND ${balanceWhere}
      `
    : await prisma.$queryRaw<IdRow[]>`
        SELECT p.id FROM "Position" p
        WHERE ${balanceWhere}
      `;
  if (rows.length === 0) return null;
  const matchingIds = rows.map((r) => r.id);
  // Intersect with any existing `id` constraint (none today, but be
  // defensive in case a future filter sets one).
  if (
    where.id &&
    typeof where.id === 'object' &&
    'in' in where.id &&
    Array.isArray(where.id.in)
  ) {
    const existing = where.id.in as number[];
    const filtered = matchingIds.filter((id) => existing.includes(id));
    if (filtered.length === 0) return null;
    where.id = { in: filtered };
  } else {
    where.id = { in: matchingIds };
  }
  return where;
};

type PositionRow = Prisma.PositionGetPayload<{
  include: {
    pickConfiguration: {
      include: { picks: true; predictions: true };
    };
  };
}>;
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

const positionKey = (chainId: number, token: string, holder: string) =>
  `${chainId}:${token}:${holder}`;

/**
 * Walk a single Position's mint + trade history with running WAC,
 * emitting one synthetic Closed row per sell (when unresolved) and an
 * Open row carrying remaining cost basis. Claims are intentionally
 * excluded — the contract reverts redeem() unless the pickConfig is
 * resolved, so any Claim is post-settlement and the existing
 * settlement-PnL flow on a resolved Position already covers it.
 */
const synthesizePositionRow = (
  r: PositionRow,
  trades: readonly TradeRow[],
  balanceFilter: ParsedBigIntFilter | null
): PositionShape[] => {
  const pc = r.pickConfiguration;
  let totalPayout = 0n;
  let predictionId: string | null = null;

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

  for (const t of trades) {
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
  type DisposalWithCostBasis = Disposal & { costBasis: bigint };
  const disposalRows: DisposalWithCostBasis[] = [];
  for (const d of disposalsSorted) {
    while (
      acqIdx < acquiresSorted.length &&
      acquiresSorted[acqIdx].ts <= d.ts
    ) {
      costPool += acquiresSorted[acqIdx].cost;
      sharesPool += acquiresSorted[acqIdx].shares;
      acqIdx += 1;
    }
    const allocated = sharesPool > 0n ? (costPool * d.shares) / sharesPool : 0n;
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

  const out: PositionShape[] = [];

  // Emit one synthetic row per sell (only meaningful for unresolved
  // pickConfigs — once settled, the existing PnL flow takes over).
  // CLOSED rows carry `balance: '0'`; emit iff `0n` satisfies the
  // balance filter (strict semantics — `{ gte: "1" }` suppresses them,
  // `{ equals: "0" }` or no filter keeps them).
  if (!isResolved && evalBigIntFilter(balanceFilter, 0n)) {
    for (const d of disposalRows) {
      out.push({
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
    out.push({
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

  return out;
};

/**
 * Synthesize a page of Position rows: split into cache hits/misses,
 * fetch trades only for the misses, then run the WAC walk per row.
 * Hits skip both the trades fetch and the synthesis loop entirely.
 */
const synthesizePositionsPage = async (
  rows: PositionRow[],
  balanceFilter: ParsedBigIntFilter | null
): Promise<PositionShape[]> => {
  const cachedByRow = new Map<PositionRow, PositionShape[]>();
  const missedRows: PositionRow[] = [];
  for (const r of rows) {
    const cached = positionSynthesisCache.get(
      positionSynthesisCacheKey(r, balanceFilter)
    );
    if (cached) cachedByRow.set(r, cached);
    else missedRows.push(r);
  }

  const missChainIds = Array.from(new Set(missedRows.map((r) => r.chainId)));
  const missTokens = Array.from(new Set(missedRows.map((r) => r.tokenAddress)));
  const missHolders = Array.from(new Set(missedRows.map((r) => r.holder)));
  const trades: TradeRow[] =
    missedRows.length === 0
      ? []
      : await prisma.secondaryTrade.findMany({
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
        });

  const tradesByPos = new Map<string, TradeRow[]>();
  for (const t of trades) {
    for (const role of [t.seller, t.buyer] as const) {
      const k = positionKey(t.chainId, t.token, role);
      const arr = tradesByPos.get(k);
      if (arr) arr.push(t);
      else tradesByPos.set(k, [t]);
    }
  }

  const out: PositionShape[] = [];
  for (const r of rows) {
    const cached = cachedByRow.get(r);
    if (cached) {
      out.push(...cached);
      continue;
    }
    const k = positionKey(r.chainId, r.tokenAddress, r.holder);
    const synthesized = synthesizePositionRow(
      r,
      tradesByPos.get(k) ?? [],
      balanceFilter
    );
    positionSynthesisCache.set(
      positionSynthesisCacheKey(r, balanceFilter),
      synthesized
    );
    out.push(...synthesized);
  }
  return out;
};

/**
 * Re-sort by the requested field. Synthetic sell rows carry the trade's
 * executedAt as their updatedAt, so without this they'd appear grouped
 * under their parent Position rather than interleaved by recency.
 */
const sortSynthesizedRows = (
  rows: PositionShape[],
  field: 'createdAt' | 'updatedAt',
  direction: 'asc' | 'desc'
): PositionShape[] => {
  const out = [...rows];
  out.sort((a, b) => {
    const diff = b[field].getTime() - a[field].getTime();
    return direction === 'asc' ? -diff : diff;
  });
  return out;
};

const EMPTY_POSITIONS_PAGE: PositionsPageEnvelope = {
  items: [],
  hasMore: false,
  totalCount: 0,
};

export const runPositions = async (
  args: RunPositionsArgs
): Promise<PositionsPageEnvelope> => {
  const norm = normalizePositionsArgs(args);

  let conditionPickConfigIds: string[] | null = null;
  if (norm.conditionId) {
    conditionPickConfigIds = await resolveConditionPickConfigIds(
      norm.conditionId
    );
    if (conditionPickConfigIds === null) return EMPTY_POSITIONS_PAGE;
  }

  let where = buildPositionsWhere(norm, conditionPickConfigIds);
  if (where === null) return EMPTY_POSITIONS_PAGE;

  if (norm.holderLower && norm.collateralFilter) {
    const next = await applyCollateralFilter(
      where,
      norm.holderLower,
      norm.collateralFilter
    );
    if (next === null) return EMPTY_POSITIONS_PAGE;
    where = next;
  }

  if (norm.balanceFilter) {
    const next = await applyBalanceFilter(
      where,
      norm.holderLower,
      norm.balanceFilter
    );
    if (next === null) return EMPTY_POSITIONS_PAGE;
    where = next;
  }

  // The PickConfiguration → Prediction relation is many-to-many in spirit:
  // any user who has predicted on this market shows up here. We only need
  // the rows where the holder is a counterparty to compute their cost
  // basis, so push the filter into the include and avoid pulling every
  // other user's prediction back over the wire. When `holder` isn't
  // pinned (conditionId / pickConfigId path), keep the full set.
  const predictionsInclude: Prisma.Picks$predictionsArgs | true =
    norm.holderLower
      ? {
          where: {
            OR: [
              { predictor: norm.holderLower },
              { counterparty: norm.holderLower },
            ],
          },
        }
      : true;

  // Fetch take+1 to detect a `hasMore`-style next page without a count
  // query. Synthesized event-stream rows from raw positions can be
  // empty (zero-balance unresolved with no sells), so client-side
  // `lastPage.length === 0` is unreliable as a stop signal — we need
  // server-truth pagination.
  //
  // `totalCount` is left null here; the PositionsPage.totalCount field
  // resolver lazily issues `prisma.position.count({ where })` only when
  // the client actually selects the field. The deprecated `positions`
  // wrapper discards totalCount entirely, so it now skips the count
  // query for free.
  const rawRows = await prisma.position.findMany({
    where,
    orderBy: { [norm.orderField]: norm.orderDirection },
    take: norm.cappedTake + 1,
    skip: norm.skipVal,
    include: {
      pickConfiguration: {
        include: { picks: true, predictions: predictionsInclude },
      },
    },
  });
  const hasMore = rawRows.length > norm.cappedTake;
  const rows = rawRows.slice(0, norm.cappedTake);

  const synthesized = await synthesizePositionsPage(rows, norm.balanceFilter);
  const sorted = sortSynthesizedRows(
    synthesized,
    norm.orderField,
    norm.orderDirection
  );
  return { items: sorted, hasMore, totalCount: null, _countWhere: where };
};

/**
 * Merge `filters: PositionFilters` with the deprecated flat arg shape.
 * `filters` wins on conflicts.
 */
const mergePositionFilters = (
  args: QueryPositionsPageArgs
): RunPositionsArgs => {
  const f = args.filters ?? null;
  return {
    take: args.take,
    skip: args.skip,
    orderBy: args.orderBy,
    orderDirection: args.orderDirection,
    holder: f?.holder ?? args.holder ?? null,
    chainId: f?.chainId ?? args.chainId ?? null,
    conditionId: f?.conditionId ?? args.conditionId ?? null,
    pickConfigId: f?.pickConfigId ?? args.pickConfigId ?? null,
    result: f?.result ?? args.result ?? null,
    settled: f?.settled ?? args.settled ?? null,
    holderWon: f?.holderWon ?? args.holderWon ?? null,
    collateral: f?.collateral ?? null,
    collateralMin: f?.collateralMin ?? args.collateralMin ?? null,
    collateralMax: f?.collateralMax ?? args.collateralMax ?? null,
    endsAtMin: f?.endsAtMin ?? args.endsAtMin ?? null,
    endsAtMax: f?.endsAtMax ?? args.endsAtMax ?? null,
    balance: f?.balance ?? null,
  };
};

export const positionsPage: NonNullable<
  QueryResolvers['positionsPage']
> = async (_parent, args) => {
  return runPositions(mergePositionFilters(args));
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
