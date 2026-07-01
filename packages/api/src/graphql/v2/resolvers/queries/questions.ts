/**
 * `Query.questions` — interleaved Condition + ConditionGroup feed.
 *
 * Delegates to v1's `runQuestionsData` SQL UNION runner; v2 surfaces
 * the discriminated entity directly through the `QuestionItem` union
 * (Condition | ConditionGroup) rather than v1's envelope wrapper. The
 * runner already produces both sides of the union per row — we just
 * pick whichever is set.
 *
 * `totalCount` is intentionally omitted on this connection: the
 * underlying UNION cannot COUNT cheaply, and v2's design rejects
 * approximation here. Clients drive end-of-feed off
 * `pageInfo.hasNextPage`.
 */

import {
  decodeQuestionCursor,
  encodeQuestionCursor,
  runQuestionsData,
  type RunQuestionsInput,
} from '../../../sdl/resolvers/queries/questions';
import {
  QuestionItemType as V1QuestionItemType,
  QuestionSortField,
  ResolutionStatus as V1ResolutionStatus,
  SortOrder as V1SortOrder,
  VolumeWindow as V1VolumeWindow,
} from '../../../sdl/__generated__/resolvers';
import type {
  QueryResolvers,
  QuestionFilter,
  QuestionItemKind,
  QuestionItemResolvers,
  ResolutionStatus,
  VolumeWindow,
} from '../../__generated__/resolvers';
import { clampTake, normalizeDirection } from '../../relay/connection';

/**
 * v2 uses SCREAMING_SNAKE for both enums; v1 uses camelCase for
 * `ResolutionStatus` and `VolumeWindow`. The mappings here are
 * stable and total — every v2 value has a v1 counterpart.
 */
const RESOLUTION_STATUS_MAP: Record<ResolutionStatus, V1ResolutionStatus> = {
  ALL: V1ResolutionStatus.All,
  RESOLVED: V1ResolutionStatus.Resolved,
  UNRESOLVED: V1ResolutionStatus.Unresolved,
  RESOLVED_YES: V1ResolutionStatus.ResolvedYes,
  RESOLVED_NO: V1ResolutionStatus.ResolvedNo,
} as Record<ResolutionStatus, V1ResolutionStatus>;

/**
 * v2's `QuestionItemKind` values mirror the `QuestionItem` union's
 * member type names; v1's `QuestionItemType` uses condition/group.
 */
const QUESTION_ITEM_KIND_MAP: Record<QuestionItemKind, V1QuestionItemType> = {
  CONDITION: V1QuestionItemType.Condition,
  CONDITION_GROUP: V1QuestionItemType.Group,
} as Record<QuestionItemKind, V1QuestionItemType>;

const VOLUME_WINDOW_MAP: Record<VolumeWindow, V1VolumeWindow> = {
  ONE_HOUR: V1VolumeWindow.OneHour,
  FOUR_HOURS: V1VolumeWindow.FourHours,
  TWENTY_FOUR_HOURS: V1VolumeWindow.TwentyFourHours,
  SEVEN_DAYS: V1VolumeWindow.SevenDays,
  ONE_HOUR_FILTERED: V1VolumeWindow.OneHourFiltered,
  FOUR_HOURS_FILTERED: V1VolumeWindow.FourHoursFiltered,
  TWENTY_FOUR_HOURS_FILTERED: V1VolumeWindow.TwentyFourHoursFiltered,
  SEVEN_DAYS_FILTERED: V1VolumeWindow.SevenDaysFiltered,
} as Record<VolumeWindow, V1VolumeWindow>;

/**
 * v2 sort enum → (runner sortField, optional volumeWindow) projection.
 *
 * Every windowed `SIMILAR_MARKET_VOLUME_*` value resolves to the same
 * SimilarMarketVolume sortField + the corresponding window; the v1
 * runner reads that pair as "sort by SUM(volume<window>)". The four
 * non-volume sorts return `volumeWindow: null` — the runner ignores
 * the window when sortField isn't SimilarMarketVolume.
 */
type OrderProjection = {
  sortField: QuestionSortField | null;
  volumeWindow: V1VolumeWindow | null;
};

const ORDER_FIELD_PROJECTION: Record<string, OrderProjection> = {
  CREATED_AT: { sortField: QuestionSortField.CreatedAt, volumeWindow: null },
  END_TIME: { sortField: QuestionSortField.EndTime, volumeWindow: null },
  OPEN_INTEREST: {
    sortField: QuestionSortField.OpenInterest,
    volumeWindow: null,
  },
  PREDICTION_COUNT: {
    sortField: QuestionSortField.PredictionCount,
    volumeWindow: null,
  },
  SIMILAR_MARKET_VOLUME_1H: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.OneHour,
  },
  SIMILAR_MARKET_VOLUME_4H: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.FourHours,
  },
  SIMILAR_MARKET_VOLUME_24H: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.TwentyFourHours,
  },
  SIMILAR_MARKET_VOLUME_7D: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.SevenDays,
  },
  SIMILAR_MARKET_VOLUME_1H_FILTERED: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.OneHourFiltered,
  },
  SIMILAR_MARKET_VOLUME_4H_FILTERED: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.FourHoursFiltered,
  },
  SIMILAR_MARKET_VOLUME_24H_FILTERED: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.TwentyFourHoursFiltered,
  },
  SIMILAR_MARKET_VOLUME_7D_FILTERED: {
    sortField: QuestionSortField.SimilarMarketVolume,
    volumeWindow: V1VolumeWindow.SevenDaysFiltered,
  },
};

const projectOrder = (field: string | null | undefined): OrderProjection =>
  (field && ORDER_FIELD_PROJECTION[field]) || {
    sortField: null,
    volumeWindow: null,
  };

type FloatRange =
  | { gte?: number | null; lte?: number | null }
  | null
  | undefined;
const rangeMin = (r: FloatRange) => r?.gte ?? null;
const rangeMax = (r: FloatRange) => r?.lte ?? null;

const toRunnerArgs = (
  filter: QuestionFilter | null | undefined,
  orderBy:
    | { field?: string | null; direction?: string | null }
    | null
    | undefined,
  first: number
): RunQuestionsInput => {
  const order = projectOrder(orderBy?.field);
  const direction = normalizeDirection(orderBy?.direction, 'desc');
  // When sort is `SIMILAR_MARKET_VOLUME_*`, the sort enum carries the
  // window — it overrides the filter's window (which controls only the
  // filter side). For other sorts, fall back to filter window so the
  // filter's `similarMarketVolume` predicate still uses the right column.
  const resolvedWindow =
    order.volumeWindow ??
    (filter?.similarMarketVolumeWindow
      ? VOLUME_WINDOW_MAP[filter.similarMarketVolumeWindow]
      : null);

  return {
    take: first,
    skip: 0,
    search: filter?.search ?? null,
    categorySlugs: filter?.categorySlugs ?? null,
    tag: filter?.tag ?? null,
    chainId: filter?.chainId ?? null,
    contractAddress: null,
    contractAddressIn: filter?.resolvers ?? null,
    minEndTime: filter?.endsAt?.gte ?? null,
    maxEndTime: filter?.endsAt?.lte ?? null,
    resolutionStatus: filter?.resolutionStatus
      ? RESOLUTION_STATUS_MAP[filter.resolutionStatus]
      : null,
    minEstimatedPrice: rangeMin(filter?.estimatedPrice),
    maxEstimatedPrice: rangeMax(filter?.estimatedPrice),
    minSimilarMarketVolume: rangeMin(filter?.similarMarketVolume),
    maxSimilarMarketVolume: rangeMax(filter?.similarMarketVolume),
    similarMarketVolumeWindow: resolvedWindow,
    sortField: order.sortField,
    sortDirection: direction === 'asc' ? V1SortOrder.Asc : V1SortOrder.Desc,
    afterCursor: null,
    questionType: filter?.questionType
      ? QUESTION_ITEM_KIND_MAP[filter.questionType]
      : null,
  };
};

/**
 * `QuestionItem` union resolver — discriminates the unwrapped Prisma
 * row by the type of its primary key: Condition.id is a 0x string
 * (CTF condition id), ConditionGroup.id is an autoincrement Int.
 */
export const QuestionItem: QuestionItemResolvers = {
  __resolveType: (obj) => {
    const id = (obj as { id?: unknown }).id;
    if (typeof id === 'string') return 'Condition';
    if (typeof id === 'number') return 'ConditionGroup';
    return null;
  },
};

type QuestionsArgs = {
  first?: number | null;
  after?: string | null;
  filter?: QuestionFilter | null;
  orderBy?: { field?: string | null; direction?: string | null } | null;
};

const questionsImpl = async (_parent: unknown, args: QuestionsArgs) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  const afterCursor = decodeQuestionCursor(args.after);
  const baseArgs = toRunnerArgs(args.filter, args.orderBy, first);
  baseArgs.afterCursor = afterCursor;

  const { items, hasMore, pageItems } = await runQuestionsData(baseArgs);

  // v2 returns the discriminated entity directly via the union. The v1
  // envelope's `condition` / `group` fields hold the underlying Prisma
  // row; pick whichever is set.
  const projected = items.map((item) => {
    const env = item as { condition?: unknown; group?: unknown };
    return env.condition ?? env.group;
  });

  const edges = projected.map((node, idx) => ({
    node,
    cursor: encodeQuestionCursor(pageItems[idx]),
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: hasMore,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};

export const questions = questionsImpl as unknown as NonNullable<
  QueryResolvers['questions']
>;
