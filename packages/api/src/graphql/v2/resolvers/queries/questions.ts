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
  mapOrderField,
  runQuestionsData,
  type RunQuestionsInput,
} from '../../../sdl/resolvers/queries/questions';
import {
  ResolutionStatus as V1ResolutionStatus,
  SortOrder as V1SortOrder,
  VolumeWindow as V1VolumeWindow,
} from '../../../sdl/__generated__/resolvers';
import type {
  QueryResolvers,
  QuestionFilter,
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
  const mapped = orderBy?.field
    ? mapOrderField(orderBy.field)
    : { sortField: null, volumeWindow: null };
  const direction = normalizeDirection(orderBy?.direction, 'desc');
  return {
    take: first,
    skip: 0,
    search: filter?.search ?? null,
    categorySlugs: filter?.categorySlugs ?? null,
    tag: filter?.tag ?? null,
    chainId: filter?.chainId ?? null,
    contractAddress: filter?.resolverAddress ?? null,
    contractAddressIn: filter?.resolverAddressIn ?? null,
    minEndTime: null,
    maxEndTime: null,
    resolutionStatus: filter?.resolutionStatus
      ? RESOLUTION_STATUS_MAP[filter.resolutionStatus]
      : null,
    minEstimatedPrice: rangeMin(filter?.estimatedPrice),
    maxEstimatedPrice: rangeMax(filter?.estimatedPrice),
    minSimilarMarketVolume: rangeMin(filter?.similarMarketVolume),
    maxSimilarMarketVolume: rangeMax(filter?.similarMarketVolume),
    similarMarketVolumeWindow: filter?.similarMarketVolumeWindow
      ? VOLUME_WINDOW_MAP[filter.similarMarketVolumeWindow]
      : mapped.volumeWindow,
    sortField: mapped.sortField,
    sortDirection: direction === 'asc' ? V1SortOrder.Asc : V1SortOrder.Desc,
    afterCursor: null,
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
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
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
