/**
 * Query.questions — the unified "questions" feed, interleaving condition
 * groups and ungrouped conditions by the chosen sort field.
 *
 * Three SQL parts, all in one LATERAL-joined $queryRaw:
 *   A. Active groups — those with at least one public unsettled
 *      condition. When per-condition filters are active (or the
 *      all-time similarMarketVolume sort is used), a LEFT JOIN against
 *      `condition` computes aggregates from only the matching
 *      conditions; otherwise the sort reads from the denormalized
 *      `condition_group` aggregate columns maintained by trigger.
 *   B. Ungrouped conditions — public conditions with
 *      conditionGroupId IS NULL. Rare; covers manual creation and
 *      Polymarket markets without an associated event.
 *   Final: UNION, sort, paginate. Then re-fetch full rows via Prisma
 *   ORM (type-safe, includes relations). Single-condition groups are
 *   unwrapped into a standalone condition item client-side so the
 *   frontend doesn't render the group shell for no-op groups.
 *
 * Pre-computed aggregate columns on `condition_group` (openInterest,
 * predictionCount, maxEndTime, maxCreatedAtEpoch, totalVolume*) are
 * maintained by the `trg_condition_group_aggregates` trigger.
 *
 * The resolver is split into small helpers to keep each step
 * inspectable in isolation:
 *
 *   normalizeArgs       → clamps + sanitizes inputs
 *   buildSqlFragments   → assembles every Prisma.sql fragment used
 *                         by the UNION query
 *   fetchSortedItems    → runs the UNION query, returns sorted ids
 *   buildConditionWhere → mirrors the SQL filters as a Prisma where
 *                         for the type-safe second-pass fetch
 *   hydrateItems        → fetches groups/conditions by id and maps
 *                         them to the QuestionReturn shape
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import type {
  QueryResolvers,
  ResolversTypes,
} from '../../__generated__/resolvers';
import {
  QuestionItemType,
  QuestionOrderField,
  OrderDirection,
  QuestionSortField,
  SortOrder,
  VolumeWindow,
  type ResolutionStatus,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

// The resolver returns Prisma rows (via mappers), not the raw SDL
// Condition/ConditionGroup shapes — the typewrapper around Question in
// ResolversTypes expects the mapped (Prisma) row types for
// condition/group, so pull them from there.
type QuestionReturn = ResolversTypes['Question'];
type ConditionReturn = ResolversTypes['Condition'];
type ConditionGroupReturn = ResolversTypes['ConditionGroup'];

type SortedItemRow = {
  item_type: string;
  group_id: number | null;
  condition_id: string | null;
  prediction_count: bigint;
  sort_value: number | string;
  end_time: number;
};

type QuestionCursor = {
  sortValue: string;
  endTime: number;
  itemType: string;
  groupId: number;
  conditionId: string;
};

type ScalarRangeFilter = {
  equals?: number | null;
  gt?: number | null;
  gte?: number | null;
  lt?: number | null;
  lte?: number | null;
  in?: number[] | null;
  notIn?: number[] | null;
  not?: number | null;
};

const volumeColumnFragments = {
  volume1h: {
    cond: Prisma.sql`c."volume1h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume1h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume1h"::numeric`,
  },
  volume4h: {
    cond: Prisma.sql`c."volume4h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume4h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume4h"::numeric`,
  },
  volume24h: {
    cond: Prisma.sql`c."volume24h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume24h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume24h"::numeric`,
  },
  volume7d: {
    cond: Prisma.sql`c."volume7d"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume7d"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume7d"::numeric`,
  },
  volumeFiltered1h: {
    cond: Prisma.sql`c."volumeFiltered1h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered1h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered1h"::numeric`,
  },
  volumeFiltered4h: {
    cond: Prisma.sql`c."volumeFiltered4h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered4h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered4h"::numeric`,
  },
  volumeFiltered24h: {
    cond: Prisma.sql`c."volumeFiltered24h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered24h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered24h"::numeric`,
  },
  volumeFiltered7d: {
    cond: Prisma.sql`c."volumeFiltered7d"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered7d"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered7d"::numeric`,
  },
} as const;

type VolumeKey = keyof typeof volumeColumnFragments;

// Keys are the GraphQL `VolumeWindow` enum values exactly as they arrive in
// the resolver (the SDK maps its friendly "1hFiltered"-style names to these
// before sending the query). Anything unrecognized — including a missing
// window — falls back to the all-time 24h column via `resolveVolumeKey`.
const volumeWindowToKey: Record<string, VolumeKey> = {
  oneHour: 'volume1h',
  fourHours: 'volume4h',
  twentyFourHours: 'volume24h',
  sevenDays: 'volume7d',
  oneHourFiltered: 'volumeFiltered1h',
  fourHoursFiltered: 'volumeFiltered4h',
  twentyFourHoursFiltered: 'volumeFiltered24h',
  sevenDaysFiltered: 'volumeFiltered7d',
};

export const resolveVolumeKey = (
  similarMarketVolumeWindow: string | null | undefined
): VolumeKey =>
  (similarMarketVolumeWindow != null
    ? volumeWindowToKey[similarMarketVolumeWindow]
    : undefined) ?? 'volume24h';

const fieldByResolvedVolumeKey: Record<VolumeKey, string> = {
  volume1h: 'similarMarketVolume1h',
  volume4h: 'similarMarketVolume4h',
  volume24h: 'similarMarketVolume24h',
  volume7d: 'similarMarketVolume7d',
  volumeFiltered1h: 'similarMarketVolumeFiltered1h',
  volumeFiltered4h: 'similarMarketVolumeFiltered4h',
  volumeFiltered24h: 'similarMarketVolumeFiltered24h',
  volumeFiltered7d: 'similarMarketVolumeFiltered7d',
};

/**
 * Inputs accepted by `runQuestions`. Hand-written interface (not derived
 * from any `Query<Field>Args`) so the runner is decoupled from any one
 * SDL field shape — both the deprecated bare-array `questions` resolver
 * and the Relay `questionsConnection` adapt their args into this shape before calling.
 */
export interface RunQuestionsInput {
  take?: number | null;
  skip?: number | null;
  search?: string | null;
  categorySlugs?: string[] | null;
  tag?: string | null;
  chainId?: number | null;
  contractAddress?: string | null;
  contractAddressIn?: string[] | null;
  minEndTime?: number | null;
  maxEndTime?: number | null;
  resolutionStatus?: ResolutionStatus | null;
  minEstimatedPrice?: number | null;
  maxEstimatedPrice?: number | null;
  minSimilarMarketVolume?: number | null;
  maxSimilarMarketVolume?: number | null;
  similarMarketVolumeWindow?: VolumeWindow | null;
  sortField?: QuestionSortField | null;
  sortDirection?: SortOrder | null;
  afterCursor?: QuestionCursor | null;
}

interface NormalizedArgs {
  take: number;
  skip: number;
  search: string | null;
  categorySlugs: string[] | null;
  tag: string | null;
  chainId: number | null | undefined;
  contractAddress: string | null;
  contractAddressIn: string[] | null;
  minEndTime: number | null | undefined;
  maxEndTime: number | null | undefined;
  resolutionStatus: ResolutionStatus | null | undefined;
  minEstimatedPrice: number | null | undefined;
  maxEstimatedPrice: number | null | undefined;
  minSimilarMarketVolume: number | null | undefined;
  maxSimilarMarketVolume: number | null | undefined;
  sortField: string;
  sortDirectionRaw: 'ASC' | 'DESC';
  afterCursor: QuestionCursor | null;
  volumeKey: VolumeKey;
  useWindowedSimilarMarketVolume: boolean;
  /**
   * True when at least one per-condition filter is active OR when the
   * all-time `similarMarketVolume` sort is used (which has no
   * denormalized aggregate column on condition_group, so still needs
   * a LEFT JOIN to compute SUM in one pass).
   */
  requiresConditionJoin: boolean;
}

const normalizeArgs = (args: RunQuestionsInput): NormalizedArgs => {
  const sortField = args.sortField ?? 'endTime';
  const volumeKey: VolumeKey =
    (args.similarMarketVolumeWindow &&
      volumeWindowToKey[args.similarMarketVolumeWindow]) ??
    'volume24h';
  const useWindowedSimilarMarketVolume = args.similarMarketVolumeWindow != null;

  // Contract-address filter normalization. Lowercased once here so the SQL
  // and Prisma `where` branches both compare against the canonical form the
  // DB stores. When a caller filters by address without specifying a chain,
  // default to `DEFAULT_CHAIN_ID` — addresses aren't a global namespace.
  const contractAddress = args.contractAddress
    ? args.contractAddress.toLowerCase()
    : null;
  const contractAddressIn =
    args.contractAddressIn && args.contractAddressIn.length > 0
      ? args.contractAddressIn.map((a) => a.toLowerCase())
      : null;
  const hasContractAddressFilter =
    contractAddress != null || contractAddressIn != null;
  const effectiveChainId =
    args.chainId != null
      ? args.chainId
      : hasContractAddressFilter
        ? DEFAULT_CHAIN_ID
        : args.chainId;

  const hasConditionFilters =
    effectiveChainId != null ||
    hasContractAddressFilter ||
    (args.resolutionStatus != null && args.resolutionStatus !== 'all') ||
    args.minEstimatedPrice != null ||
    args.maxEstimatedPrice != null ||
    args.minEndTime != null ||
    args.maxEndTime != null ||
    args.minSimilarMarketVolume != null ||
    args.maxSimilarMarketVolume != null;

  return {
    take: clampTake(args.take, { defaultTake: 50, maxTake: 100 }),
    skip: clampSkip(args.skip),
    search: args.search?.slice(0, 200) ?? null,
    categorySlugs: args.categorySlugs?.slice(0, 50) ?? null,
    tag: args.tag?.slice(0, 200) ?? null,
    chainId: effectiveChainId,
    contractAddress,
    contractAddressIn,
    minEndTime: args.minEndTime,
    maxEndTime: args.maxEndTime,
    resolutionStatus: args.resolutionStatus,
    minEstimatedPrice: args.minEstimatedPrice,
    maxEstimatedPrice: args.maxEstimatedPrice,
    minSimilarMarketVolume: args.minSimilarMarketVolume,
    maxSimilarMarketVolume: args.maxSimilarMarketVolume,
    sortField,
    // SortOrder enum carries `asc`/`desc` plus uppercase ASC/DESC aliases
    // for older clients.
    sortDirectionRaw:
      args.sortDirection === 'asc' || args.sortDirection === 'ASC'
        ? 'ASC'
        : 'DESC',
    afterCursor: args.afterCursor ?? null,
    volumeKey,
    useWindowedSimilarMarketVolume,
    requiresConditionJoin:
      hasConditionFilters ||
      (sortField === 'similarMarketVolume' && !useWindowedSimilarMarketVolume),
  };
};

/**
 * Per-condition filter fragments shared by the group LEFT JOIN and the
 * ungrouped condition branch. Each fragment is either `Prisma.empty` or
 * `AND <predicate>` so they slot into a WHERE clause without changing
 * the surrounding SQL shape.
 */
interface ConditionFilterFragments {
  resolvedFilter: Prisma.Sql;
  priceFilter: Prisma.Sql;
  similarMarketVolumeFilter: Prisma.Sql;
  endTimeFilter: Prisma.Sql;
  /** Concatenation of the four fragments above. */
  conditionFilters: Prisma.Sql;
}

const buildConditionFilterFragments = (
  n: NormalizedArgs
): ConditionFilterFragments => {
  const resolvedFilter = (() => {
    if (!n.resolutionStatus || n.resolutionStatus === 'all')
      return Prisma.empty;
    switch (n.resolutionStatus) {
      case 'unresolved':
        return Prisma.sql`AND c.settled = false`;
      case 'resolved':
        return Prisma.sql`AND c.settled = true`;
      case 'resolvedYes':
        return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = true`;
      case 'resolvedNo':
        return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = false`;
      default:
        return Prisma.empty;
    }
  })();

  const priceFilter = (() => {
    const parts: Prisma.Sql[] = [];
    if (n.minEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" >= ${n.minEstimatedPrice}`);
    }
    if (n.maxEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" <= ${n.maxEstimatedPrice}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const volumeFragments = volumeColumnFragments[n.volumeKey];

  const similarMarketVolumeFilter = (() => {
    const parts: Prisma.Sql[] = [];
    const expr = n.useWindowedSimilarMarketVolume
      ? volumeFragments.cond
      : Prisma.sql`c."similarMarketVolume"`;
    if (n.minSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} >= ${n.minSimilarMarketVolume}`);
    }
    if (n.maxSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} <= ${n.maxSimilarMarketVolume}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const endTimeFilter = (() => {
    const parts: Prisma.Sql[] = [];
    if (n.minEndTime != null) {
      parts.push(Prisma.sql`c."endTime" >= ${n.minEndTime}`);
    }
    if (n.maxEndTime != null) {
      parts.push(Prisma.sql`c."endTime" <= ${n.maxEndTime}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const chainIdFilter =
    n.chainId != null
      ? Prisma.sql`AND c."chainId" = ${n.chainId}`
      : Prisma.empty;

  // Contract-address filter applied at the same condition-row level as
  // `chainId` — both the group LEFT JOIN and the ungrouped-condition
  // branch consume `conditionFilters`, so this scopes both. Without it
  // the page would pick the right groups but `hydrateItems` would still
  // need a matching Prisma `where` (kept in `buildConditionWhere` below)
  // to avoid hydrating extra conditions.
  const contractAddressFilter = (() => {
    if (n.contractAddress != null) {
      return Prisma.sql`AND c."resolver" = ${n.contractAddress}`;
    }
    if (n.contractAddressIn != null && n.contractAddressIn.length > 0) {
      return Prisma.sql`AND c."resolver" = ANY(${n.contractAddressIn}::text[])`;
    }
    return Prisma.empty;
  })();

  const conditionFilters = Prisma.sql`
    ${chainIdFilter}
    ${contractAddressFilter}
    ${resolvedFilter}
    ${priceFilter}
    ${similarMarketVolumeFilter}
    ${endTimeFilter}
  `;

  return {
    resolvedFilter,
    priceFilter,
    similarMarketVolumeFilter,
    endTimeFilter,
    conditionFilters,
  };
};

/** Sort-value SQL fragments for both the group and condition branches. */
interface SortFragments {
  /** SUM/MAX expr aggregated over the group's matching conditions. */
  groupSortValue: Prisma.Sql;
  /** Single-row sort expr for ungrouped conditions. */
  condSortValue: Prisma.Sql;
  /** SUM/aggregate of c."predictionCount" used by the group branch. */
  groupPredictionCount: Prisma.Sql;
  /** MAX of c."endTime" used by the group branch. */
  groupEndTime: Prisma.Sql;
  /** GROUP BY + HAVING for the group branch (empty when no JOIN). */
  groupByClause: Prisma.Sql;
  /** LEFT JOIN against `condition` (empty when filters allow the trigger
   * aggregates to satisfy the sort directly). */
  groupConditionJoin: Prisma.Sql;
}

const buildSortFragments = (
  n: NormalizedArgs,
  filters: ConditionFilterFragments
): SortFragments => {
  const volumeFragments = volumeColumnFragments[n.volumeKey];

  const sortValueExpr = (() => {
    switch (n.sortField) {
      case 'openInterest':
        return Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)`;
      case 'predictionCount':
        return Prisma.sql`COALESCE(SUM(c."predictionCount")::numeric, 0)`;
      case 'createdAt':
        return Prisma.sql`COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint)::numeric, 0)`;
      case 'similarMarketVolume':
        return n.useWindowedSimilarMarketVolume
          ? volumeFragments.sumExpr
          : Prisma.sql`COALESCE(SUM(c."similarMarketVolume"), 0)::numeric`;
      default:
        return Prisma.sql`COALESCE(MAX(c."endTime")::numeric, 0)`;
    }
  })();

  const groupConditionJoin = n.requiresConditionJoin
    ? Prisma.sql`LEFT JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${filters.conditionFilters}`
    : Prisma.empty;

  const groupSortValue = n.requiresConditionJoin
    ? sortValueExpr
    : n.sortField === 'openInterest'
      ? Prisma.sql`cg."totalOpenInterest"::numeric`
      : n.sortField === 'predictionCount'
        ? Prisma.sql`cg."totalPredictionCount"::numeric`
        : n.sortField === 'createdAt'
          ? Prisma.sql`cg."maxCreatedAtEpoch"::numeric`
          : n.sortField === 'similarMarketVolume'
            ? volumeFragments.group
            : Prisma.sql`cg."maxEndTime"::numeric`;

  const groupPredictionCount = n.requiresConditionJoin
    ? Prisma.sql`COALESCE(SUM(c."predictionCount"), 0)`
    : Prisma.sql`cg."totalPredictionCount"`;

  const groupEndTime = n.requiresConditionJoin
    ? Prisma.sql`COALESCE(MAX(c."endTime"), 0)`
    : Prisma.sql`cg."maxEndTime"`;

  const groupByClause = n.requiresConditionJoin
    ? Prisma.sql`GROUP BY cg.id HAVING COUNT(c.id) > 0`
    : Prisma.empty;

  const condSortValue =
    n.sortField === 'openInterest'
      ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)`
      : n.sortField === 'predictionCount'
        ? Prisma.sql`c."predictionCount"::numeric`
        : n.sortField === 'createdAt'
          ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::numeric`
          : n.sortField === 'similarMarketVolume'
            ? n.useWindowedSimilarMarketVolume
              ? Prisma.sql`COALESCE(${volumeFragments.cond}, 0)::numeric`
              : Prisma.sql`COALESCE(c."similarMarketVolume", 0)::numeric`
            : Prisma.sql`COALESCE(c."endTime", 2147483647)::numeric`;

  return {
    groupSortValue,
    condSortValue,
    groupPredictionCount,
    groupEndTime,
    groupByClause,
    groupConditionJoin,
  };
};

/**
 * Search/category/tag fragments for the group branch (where matches can
 * come from the group name OR any of its conditions) and the
 * ungrouped-condition branch (single-row predicates).
 */
interface SearchFragments {
  groupSearch: Prisma.Sql;
  groupCategory: Prisma.Sql;
  groupTag: Prisma.Sql;
  condSearch: Prisma.Sql;
  condCategory: Prisma.Sql;
  condTag: Prisma.Sql;
}

const buildSearchFragments = (n: NormalizedArgs): SearchFragments => {
  const term = n.search ? `%${n.search}%` : null;

  return {
    groupSearch: term
      ? Prisma.sql`AND (
          cg.name ILIKE ${term}
          OR EXISTS (
            SELECT 1 FROM condition c_search
            WHERE c_search."conditionGroupId" = cg.id
              AND c_search.public = true
              AND (
                c_search.question ILIKE ${term}
                OR c_search."shortName" ILIKE ${term}
                OR EXISTS (SELECT 1 FROM unnest(c_search.tags) AS t WHERE t ILIKE ${term})
              )
          )
        )`
      : Prisma.empty,
    groupCategory: n.categorySlugs?.length
      ? Prisma.sql`AND cg."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${n.categorySlugs}::text[]))`
      : Prisma.empty,
    groupTag: n.tag
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM condition c_tag
          WHERE c_tag."conditionGroupId" = cg.id
            AND c_tag.public = true
            AND ${n.tag} = ANY(c_tag.tags)
        )`
      : Prisma.empty,
    condSearch: term
      ? Prisma.sql`AND (c.question ILIKE ${term} OR c."shortName" ILIKE ${term} OR EXISTS (SELECT 1 FROM unnest(c.tags) AS t WHERE t ILIKE ${term}))`
      : Prisma.empty,
    condCategory: n.categorySlugs?.length
      ? Prisma.sql`AND c."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${n.categorySlugs}::text[]))`
      : Prisma.empty,
    condTag: n.tag ? Prisma.sql`AND ${n.tag} = ANY(c.tags)` : Prisma.empty,
  };
};

const cursorIdentity = (row: SortedItemRow) => ({
  groupId: row.group_id ?? 0,
  conditionId: row.condition_id ?? '',
  itemType: row.item_type,
  endTime: Number(row.end_time ?? 0),
});

const encodeQuestionCursor = (row: SortedItemRow): string => {
  const identity = cursorIdentity(row);
  return encodeCursor({
    k: String(row.sort_value),
    id: JSON.stringify(identity),
  });
};

const decodeQuestionCursor = (cursor: string | null | undefined) => {
  if (!cursor) return null;
  const payload = decodeCursor(cursor);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload.id) as Partial<QuestionCursor>;
    const groupId = Number(parsed.groupId);
    const endTime = Number(parsed.endTime);
    const itemType = String(parsed.itemType ?? '');
    const conditionId = String(parsed.conditionId ?? '');
    if (!itemType || !Number.isFinite(groupId) || !Number.isFinite(endTime)) {
      return null;
    }
    return {
      sortValue: payload.k,
      itemType,
      groupId,
      conditionId,
      endTime,
    } satisfies QuestionCursor;
  } catch {
    return null;
  }
};

const buildQuestionCursorWhere = (n: NormalizedArgs): Prisma.Sql => {
  const c = n.afterCursor;
  if (!c) return Prisma.empty;
  const sortCmp = n.sortDirectionRaw === 'ASC' ? '>' : '<';
  const sortValue = Number(c.sortValue);
  const normalizedSortValue = Number.isFinite(sortValue)
    ? sortValue
    : c.sortValue;
  return Prisma.sql`
    WHERE (
      sort_value ${Prisma.raw(sortCmp)} ${normalizedSortValue}
      OR (sort_value = ${normalizedSortValue} AND end_time > ${c.endTime})
      OR (sort_value = ${normalizedSortValue} AND end_time = ${c.endTime} AND item_type > ${c.itemType})
      OR (sort_value = ${normalizedSortValue} AND end_time = ${c.endTime} AND item_type = ${c.itemType} AND COALESCE(group_id, 0) > ${c.groupId})
      OR (sort_value = ${normalizedSortValue} AND end_time = ${c.endTime} AND item_type = ${c.itemType} AND COALESCE(group_id, 0) = ${c.groupId} AND COALESCE(condition_id, '') > ${c.conditionId})
    )
  `;
};

const fetchSortedItems = async (
  n: NormalizedArgs
): Promise<SortedItemRow[]> => {
  const filters = buildConditionFilterFragments(n);
  const sort = buildSortFragments(n, filters);
  const search = buildSearchFragments(n);
  const cursorWhere = buildQuestionCursorWhere(n);
  const offsetClause = n.afterCursor
    ? Prisma.empty
    : Prisma.sql`OFFSET ${n.skip}`;

  return prisma.$queryRaw<SortedItemRow[]>`
    WITH combined AS (
      -- Part A: Active groups
      SELECT
        'group' as item_type,
        cg.id as group_id,
        NULL::text as condition_id,
        ${sort.groupSortValue} as sort_value,
        ${sort.groupPredictionCount} as prediction_count,
        ${sort.groupEndTime} as end_time
      FROM condition_group cg
      ${sort.groupConditionJoin}
      WHERE cg."publicConditionCount" > 0
        ${search.groupSearch}
        ${search.groupCategory}
        ${search.groupTag}
      ${sort.groupByClause}

      UNION ALL

      -- Part B: Ungrouped conditions
      SELECT
        'condition' as item_type,
        NULL::integer as group_id,
        c.id as condition_id,
        ${sort.condSortValue} as sort_value,
        c."predictionCount" as prediction_count,
        COALESCE(c."endTime", 2147483647) as end_time
      FROM condition c
      WHERE c.public = true
        AND c."conditionGroupId" IS NULL
        ${filters.conditionFilters}
        ${search.condSearch}
        ${search.condCategory}
        ${search.condTag}
    )
    SELECT item_type, group_id, condition_id, prediction_count, sort_value, end_time
    FROM combined
    ${cursorWhere}
    ORDER BY sort_value ${Prisma.raw(n.sortDirectionRaw)},
             end_time ASC,
             item_type ASC,
             COALESCE(group_id, 0) ASC,
             COALESCE(condition_id, '') ASC
    LIMIT ${n.take + 1}
    ${offsetClause}
  `;
};

/**
 * Mirrors the SQL conditionFilters as a Prisma where clause for the
 * second-pass `conditionGroup.findMany` include filter — keeps the
 * nested condition list filtered to the same set the SQL UNION
 * surfaced.
 */
const buildConditionWhere = (n: NormalizedArgs): Prisma.ConditionWhereInput => {
  const resolvedPrismaFilter = (() => {
    if (!n.resolutionStatus || n.resolutionStatus === 'all') return {};
    switch (n.resolutionStatus) {
      case 'unresolved':
        return { settled: false };
      case 'resolved':
        return { settled: true };
      case 'resolvedYes':
        return { settled: true, resolvedToYes: true };
      case 'resolvedNo':
        return { settled: true, resolvedToYes: false };
      default:
        return {};
    }
  })();

  const estimatedPriceFilter = {
    ...(n.minEstimatedPrice != null ? { gte: n.minEstimatedPrice } : {}),
    ...(n.maxEstimatedPrice != null ? { lte: n.maxEstimatedPrice } : {}),
  };
  const similarMarketVolumeRangeFilter = {
    ...(n.minSimilarMarketVolume != null
      ? { gte: n.minSimilarMarketVolume }
      : {}),
    ...(n.maxSimilarMarketVolume != null
      ? { lte: n.maxSimilarMarketVolume }
      : {}),
  };

  const prismaSimilarMarketVolumeFilter = (() => {
    if (Object.keys(similarMarketVolumeRangeFilter).length === 0) return {};
    if (!n.useWindowedSimilarMarketVolume) {
      return { similarMarketVolume: similarMarketVolumeRangeFilter };
    }
    const field = fieldByResolvedVolumeKey[n.volumeKey];
    return { [field]: similarMarketVolumeRangeFilter };
  })();

  // Mirror the SQL `contractAddressFilter` so the two-pass resolver
  // hydrates only the conditions the UNION surfaced. Without this, the
  // page picks the right groups but `hydrateItems` still pulls every
  // sibling condition on the group.
  const contractAddressPrismaFilter =
    n.contractAddress != null
      ? { resolver: n.contractAddress }
      : n.contractAddressIn != null && n.contractAddressIn.length > 0
        ? { resolver: { in: n.contractAddressIn } }
        : {};

  return {
    public: true,
    ...(n.chainId !== null && n.chainId !== undefined
      ? { chainId: n.chainId }
      : {}),
    ...contractAddressPrismaFilter,
    ...resolvedPrismaFilter,
    ...(n.minEndTime !== null && n.minEndTime !== undefined
      ? { endTime: { gte: n.minEndTime } }
      : {}),
    ...(n.maxEndTime !== null && n.maxEndTime !== undefined
      ? {
          endTime: {
            ...((n.minEndTime !== null && n.minEndTime !== undefined
              ? { gte: n.minEndTime }
              : {}) as object),
            lte: n.maxEndTime,
          },
        }
      : {}),
    ...(Object.keys(estimatedPriceFilter).length > 0
      ? { estimatedPrice: estimatedPriceFilter }
      : {}),
    ...prismaSimilarMarketVolumeFilter,
  };
};

type HydratedQuestion = {
  item: QuestionReturn;
  pageItem: SortedItemRow;
};

const hydrateItems = async (
  pageItems: SortedItemRow[],
  conditionWhere: Prisma.ConditionWhereInput
): Promise<HydratedQuestion[]> => {
  const groupIds = pageItems
    .filter((r) => r.item_type === 'group' && r.group_id !== null)
    .map((r) => r.group_id as number);
  const conditionIds = pageItems
    .filter((r) => r.item_type === 'condition' && r.condition_id !== null)
    .map((r) => r.condition_id as string);

  const groupInclude = {
    category: true,
    condition: {
      where: conditionWhere,
      orderBy: { displayOrder: 'asc' as const },
      include: { category: true },
    },
  } as const;

  const [groups, conditions] = await Promise.all([
    groupIds.length > 0
      ? prisma.conditionGroup.findMany({
          where: { id: { in: groupIds } },
          include: groupInclude,
        })
      : ([] as Prisma.ConditionGroupGetPayload<{
          include: typeof groupInclude;
        }>[]),
    conditionIds.length > 0
      ? prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          include: { category: true },
        })
      : ([] as Prisma.ConditionGetPayload<{ include: { category: true } }>[]),
  ]);

  const groupMap = new Map<number, (typeof groups)[number]>();
  for (const g of groups) groupMap.set(g.id, g);
  const conditionMap = new Map<string, (typeof conditions)[number]>();
  for (const c of conditions) conditionMap.set(c.id, c);

  // Intermediate shape — Question field resolvers (Question.ts) fill in
  // `source`, `title`, `description`, etc. from this shape, so the
  // runner only needs to populate the discriminator + the wrapped row +
  // the prediction count.
  const result: HydratedQuestion[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (item: any, pageItem: SortedItemRow) =>
    result.push({ item: item as QuestionReturn, pageItem });
  for (const item of pageItems) {
    if (item.item_type === 'group' && item.group_id !== null) {
      const group = groupMap.get(item.group_id);
      if (!group) continue;
      if (group.condition.length === 1) {
        // Unwrap single-condition groups as standalone conditions so the
        // frontend doesn't render a group shell around a lone item.
        push(
          {
            questionType: QuestionItemType.Condition,
            group: null,
            condition: group.condition[0] as unknown as ConditionReturn,
            predictionCount: Number(item.prediction_count),
          },
          item
        );
      } else if (group.condition.length > 1) {
        push(
          {
            questionType: QuestionItemType.Group,
            group: {
              ...group,
              conditions: group.condition,
            } as unknown as ConditionGroupReturn,
            condition: null,
            predictionCount: Number(item.prediction_count),
          },
          item
        );
      }
    } else if (item.item_type === 'condition' && item.condition_id !== null) {
      const condition = conditionMap.get(item.condition_id);
      if (!condition) continue;
      push(
        {
          questionType: QuestionItemType.Condition,
          group: null,
          condition: condition as unknown as ConditionReturn,
          predictionCount: Number(item.prediction_count),
        },
        item
      );
    }
  }
  return result;
};

const runQuestionsData = async (
  args: RunQuestionsInput
): Promise<{
  items: QuestionReturn[];
  hasMore: boolean;
  pageItems: SortedItemRow[];
}> => {
  const n = normalizeArgs(args);
  const conditionWhere = buildConditionWhere(n);
  const hydrated: HydratedQuestion[] = [];
  let afterCursor = n.afterCursor;
  let skip = n.skip;
  let hasMore = false;

  while (hydrated.length < n.take) {
    const remaining = n.take - hydrated.length;
    const sortedItems = await fetchSortedItems({
      ...n,
      take: remaining,
      skip: afterCursor ? 0 : skip,
      afterCursor,
    });
    hasMore = sortedItems.length > remaining;
    const pageItems = sortedItems.slice(0, remaining);
    if (pageItems.length === 0) break;

    hydrated.push(...(await hydrateItems(pageItems, conditionWhere)));

    const lastPageItem = pageItems[pageItems.length - 1];
    afterCursor = {
      sortValue: String(lastPageItem.sort_value),
      ...cursorIdentity(lastPageItem),
    };
    skip = 0;

    if (!hasMore) break;
  }

  const page = hydrated.slice(0, n.take);
  return {
    items: page.map((entry) => entry.item),
    hasMore,
    pageItems: page.map((entry) => entry.pageItem),
  };
};

export const runQuestions = async (
  args: RunQuestionsInput
): Promise<{ items: QuestionReturn[]; hasMore: boolean }> => {
  const { items, hasMore } = await runQuestionsData(args);
  return { items, hasMore };
};

// ---------------------------------------------------------------------
// Relay-shaped `questions` connection (PR 2)
// ---------------------------------------------------------------------
// `questionsConnection` uses the same SQL UNION runner as the deprecated bare-array
// `questions` resolver, but passes a decoded ordering tuple after the first page so pagination is
// keyset-based rather than OFFSET-based.

import { decodeCursor, encodeCursor } from '../../../relay/cursor';

/**
 * Map the public `QuestionOrderField` enum to the internal
 * `QuestionSortField` (plus a `VolumeWindow` for windowed-volume sorts).
 * `OPEN_INTEREST` is intentionally not in `QuestionOrderField`; if the
 * enum ever grows a value not covered here, fall through to the
 * runner's `CREATED_AT DESC` default.
 */
const mapOrderField = (
  field: QuestionOrderField
): { sortField: QuestionSortField; volumeWindow: VolumeWindow | null } => {
  switch (field) {
    case QuestionOrderField.CreatedAt:
      return { sortField: QuestionSortField.CreatedAt, volumeWindow: null };
    case QuestionOrderField.ResolvesAt:
      return { sortField: QuestionSortField.EndTime, volumeWindow: null };
    case QuestionOrderField.PredictionCount:
      return {
        sortField: QuestionSortField.PredictionCount,
        volumeWindow: null,
      };
    case QuestionOrderField.SimilarMarketVolume_24H:
      return {
        sortField: QuestionSortField.SimilarMarketVolume,
        volumeWindow: VolumeWindow.TwentyFourHours,
      };
    case QuestionOrderField.SimilarMarketVolume_7D:
      return {
        sortField: QuestionSortField.SimilarMarketVolume,
        volumeWindow: VolumeWindow.SevenDays,
      };
    default:
      return { sortField: QuestionSortField.CreatedAt, volumeWindow: null };
  }
};

const rangeMin = (filter: ScalarRangeFilter | null | undefined) =>
  filter?.gte ?? filter?.gt ?? filter?.equals ?? null;

const rangeMax = (filter: ScalarRangeFilter | null | undefined) =>
  filter?.lte ?? filter?.lt ?? filter?.equals ?? null;

export const questionsConnection: NonNullable<
  QueryResolvers['questionsConnection']
> = async (_parent, { first, after, filter, orderBy, take, skip }) => {
  const cappedFirst = clampTake(first ?? take ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const afterCursor = decodeQuestionCursor(after);

  const mapped = orderBy?.field
    ? mapOrderField(orderBy.field)
    : { sortField: null, volumeWindow: null };
  const sortDirection: SortOrder | null =
    orderBy?.direction === OrderDirection.Asc
      ? SortOrder.Asc
      : orderBy?.direction === OrderDirection.Desc
        ? SortOrder.Desc
        : null;
  const operatorFilter = filter as typeof filter & {
    resolvesAt?: ScalarRangeFilter | null;
    estimatedPrice?: ScalarRangeFilter | null;
    similarMarketVolume?: ScalarRangeFilter | null;
  };

  const { items, hasMore, pageItems } = await runQuestionsData({
    take: cappedFirst,
    skip: after ? 0 : (skip ?? 0),
    search: filter?.search ?? null,
    categorySlugs: filter?.categorySlugs ?? null,
    tag: filter?.tag ?? null,
    chainId: filter?.chainId ?? null,
    contractAddress: filter?.marketAddress ?? null,
    contractAddressIn: filter?.marketAddressIn ?? null,
    minEndTime: rangeMin(operatorFilter?.resolvesAt),
    maxEndTime: rangeMax(operatorFilter?.resolvesAt),
    resolutionStatus: filter?.resolutionStatus ?? null,
    minEstimatedPrice: rangeMin(operatorFilter?.estimatedPrice),
    maxEstimatedPrice: rangeMax(operatorFilter?.estimatedPrice),
    minSimilarMarketVolume: rangeMin(operatorFilter?.similarMarketVolume),
    maxSimilarMarketVolume: rangeMax(operatorFilter?.similarMarketVolume),
    similarMarketVolumeWindow:
      filter?.similarMarketVolumeWindow ?? mapped.volumeWindow,
    sortField: mapped.sortField,
    sortDirection,
    afterCursor,
  });

  const edges = items.map((item, idx) => ({
    node: item,
    cursor: encodeQuestionCursor(pageItems[idx]),
  }));

  return {
    items,
    hasMore,
    edges,
    nodes: items,
    pageInfo: {
      hasNextPage: hasMore,
      hasPreviousPage: afterCursor != null,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
