import { graphqlRequestV2 } from './client/graphqlClient';
import type { ConditionType } from './conditions';
import type {
  ConditionGroupType,
  ConditionGroupConditionType,
} from './conditionGroups';

export type SortField =
  | 'openInterest'
  | 'endTime'
  | 'createdAt'
  | 'predictionCount'
  | 'similarMarketVolume';
export type SortDirection = 'asc' | 'desc';
export type VolumeWindow =
  | '1h'
  | '4h'
  | '24h'
  | '7d'
  | '1hFiltered'
  | '4hFiltered'
  | '24hFiltered'
  | '7dFiltered';
export type ResolutionStatusValue =
  | 'all'
  | 'unresolved'
  | 'resolved'
  | 'resolvedYes'
  | 'resolvedNo';

export interface QuestionType {
  questionType: 'group' | 'condition';
  group?: ConditionGroupType | null;
  condition?: ConditionType | null;
}

/** Map friendly VolumeWindow values to v2 `VolumeWindow` enum keys. */
const VOLUME_WINDOW_TO_V2: Record<VolumeWindow, string> = {
  '1h': 'ONE_HOUR',
  '4h': 'FOUR_HOURS',
  '24h': 'TWENTY_FOUR_HOURS',
  '7d': 'SEVEN_DAYS',
  '1hFiltered': 'ONE_HOUR_FILTERED',
  '4hFiltered': 'FOUR_HOURS_FILTERED',
  '24hFiltered': 'TWENTY_FOUR_HOURS_FILTERED',
  '7dFiltered': 'SEVEN_DAYS_FILTERED',
};

/**
 * v2 packs the volume window into the sort enum (`QuestionOrderField`)
 * instead of v1's separate `sortField + similarMarketVolumeWindow` pair.
 */
const VOLUME_WINDOW_TO_ORDER_FIELD: Record<VolumeWindow, string> = {
  '1h': 'SIMILAR_MARKET_VOLUME_1H',
  '4h': 'SIMILAR_MARKET_VOLUME_4H',
  '24h': 'SIMILAR_MARKET_VOLUME_24H',
  '7d': 'SIMILAR_MARKET_VOLUME_7D',
  '1hFiltered': 'SIMILAR_MARKET_VOLUME_1H_FILTERED',
  '4hFiltered': 'SIMILAR_MARKET_VOLUME_4H_FILTERED',
  '24hFiltered': 'SIMILAR_MARKET_VOLUME_24H_FILTERED',
  '7dFiltered': 'SIMILAR_MARKET_VOLUME_7D_FILTERED',
};

const SORT_FIELD_TO_V2: Record<
  Exclude<SortField, 'similarMarketVolume'>,
  string
> = {
  openInterest: 'OPEN_INTEREST',
  endTime: 'END_TIME',
  createdAt: 'CREATED_AT',
  predictionCount: 'PREDICTION_COUNT',
};

const RESOLUTION_STATUS_TO_V2: Record<ResolutionStatusValue, string> = {
  all: 'ALL',
  unresolved: 'UNRESOLVED',
  resolved: 'RESOLVED',
  resolvedYes: 'RESOLVED_YES',
  resolvedNo: 'RESOLVED_NO',
};

/** v2 maxTake for the questions connection. */
const V2_MAX_FIRST = 100;

/**
 * Shared Condition selection for both union members. The feed reads the
 * flat windowed-volume mirrors (v1-compat columns on the v2 Condition)
 * because `market-helpers` string-indexes them for client-side filters.
 */
const QUESTION_CONDITION_FIELDS = `
  conditionId
  createdAt
  question
  shortName
  optionName
  endTime
  isPublic
  description
  chainId
  resolver
  settled
  resolvedToYes
  nonDecisive
  openInterest
  estimatedPrice
  similarMarketVolume
  similarMarketVolume1h
  similarMarketVolume4h
  similarMarketVolume24h
  similarMarketVolume7d
  similarMarketVolumeFiltered1h
  similarMarketVolumeFiltered4h
  similarMarketVolumeFiltered24h
  similarMarketVolumeFiltered7d
  similarMarket {
    image
    markets
  }
  category {
    name
    slug
  }
`;

/**
 * v2 interleaved Condition + ConditionGroup feed.
 *
 * `QuestionConnection` deliberately exposes ONLY `edges` + `pageInfo` —
 * no `nodes` (union members don't share a field set) and no `totalCount`
 * (the SQL UNION can't COUNT cheaply). End-of-feed is signalled by
 * `pageInfo.hasNextPage`.
 */
export const GET_QUESTIONS = `
  query Questions(
    $first: Int
    $after: String
    $filter: QuestionFilter
    $orderBy: QuestionOrder
  ) {
    questions(
      first: $first
      after: $after
      filter: $filter
      orderBy: $orderBy
    ) {
      edges {
        cursor
        node {
          __typename
          ... on Condition {
            ${QUESTION_CONDITION_FIELDS}
          }
          ... on ConditionGroup {
            id
            createdAt
            name
            category {
              name
              slug
            }
            conditions(first: 50) {
              nodes {
                ${QUESTION_CONDITION_FIELDS}
                displayOrder
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface QuestionFeedParams {
  chainId?: number;
  sortField: SortField;
  sortDirection: SortDirection;
  search?: string;
  categorySlugs?: string[];
  minEndTime?: number;
  resolutionStatus?: string;
  minEstimatedPrice?: number;
  maxEstimatedPrice?: number;
  minSimilarMarketVolume?: number;
  maxSimilarMarketVolume?: number;
  tag?: string;
  similarMarketVolumeWindow?: VolumeWindow;
}

export interface FetchQuestionsSortedParams extends QuestionFeedParams {
  take: number;
  skip: number;
}

export interface QuestionsVariables {
  filter: Record<string, unknown> | undefined;
  orderBy: { field: string; direction: 'ASC' | 'DESC' };
}

/**
 * Maps the stable v1-shaped feed params onto v2 `QuestionFilter` +
 * `QuestionOrder`. orderBy is always explicit.
 *
 * Windowed volume sorts pack the window into the order-field enum. v1's
 * windowless `similarMarketVolume` sort ordered by the ALL-TIME column,
 * which has no v2 counterpart — `SIMILAR_MARKET_VOLUME_7D` is the
 * documented closest proxy (follow-up if v2 grows an all-time variant).
 */
export function buildQuestionsVariables(
  params: QuestionFeedParams
): QuestionsVariables {
  const direction = params.sortDirection === 'asc' ? 'ASC' : 'DESC';
  const orderBy: QuestionsVariables['orderBy'] = {
    field:
      params.sortField === 'similarMarketVolume'
        ? VOLUME_WINDOW_TO_ORDER_FIELD[params.similarMarketVolumeWindow ?? '7d']
        : SORT_FIELD_TO_V2[params.sortField],
    direction,
  };

  const filter: Record<string, unknown> = {};

  if (params.chainId !== undefined) {
    filter.chainId = params.chainId;
  }
  if (params.search?.trim()) {
    filter.search = params.search.trim();
  }
  if (params.categorySlugs && params.categorySlugs.length > 0) {
    filter.categorySlugs = params.categorySlugs;
  }
  if (params.tag) {
    filter.tag = params.tag;
  }
  if (params.minEndTime !== undefined) {
    filter.endsAt = { gte: params.minEndTime };
  }
  if (params.resolutionStatus) {
    const mapped =
      RESOLUTION_STATUS_TO_V2[params.resolutionStatus as ResolutionStatusValue];
    if (mapped) {
      filter.resolutionStatus = mapped;
    }
  }
  if (
    params.minEstimatedPrice !== undefined ||
    params.maxEstimatedPrice !== undefined
  ) {
    const range: Record<string, number> = {};
    if (params.minEstimatedPrice !== undefined) {
      range.gte = params.minEstimatedPrice;
    }
    if (params.maxEstimatedPrice !== undefined) {
      range.lte = params.maxEstimatedPrice;
    }
    filter.estimatedPrice = range;
  }
  if (
    params.minSimilarMarketVolume !== undefined ||
    params.maxSimilarMarketVolume !== undefined
  ) {
    const range: Record<string, number> = {};
    if (params.minSimilarMarketVolume !== undefined) {
      range.gte = params.minSimilarMarketVolume;
    }
    if (params.maxSimilarMarketVolume !== undefined) {
      range.lte = params.maxSimilarMarketVolume;
    }
    filter.similarMarketVolume = range;
  }
  if (params.similarMarketVolumeWindow) {
    filter.similarMarketVolumeWindow =
      VOLUME_WINDOW_TO_V2[params.similarMarketVolumeWindow];
  }

  return {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    orderBy,
  };
}

type QuestionConditionV2Node = {
  conditionId: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  endTime: number | string;
  isPublic: boolean;
  description: string;
  chainId: number;
  resolver?: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  estimatedPrice?: number | null;
  similarMarketVolume?: number;
  similarMarketVolume1h?: number;
  similarMarketVolume4h?: number;
  similarMarketVolume24h?: number;
  similarMarketVolume7d?: number;
  similarMarketVolumeFiltered1h?: number;
  similarMarketVolumeFiltered4h?: number;
  similarMarketVolumeFiltered24h?: number;
  similarMarketVolumeFiltered7d?: number;
  similarMarket?: { image?: string | null; markets?: string[] } | null;
  displayOrder?: number | null;
  category?: { name: string; slug: string } | null;
};

/** Raw v2 `QuestionItem` union node — discriminate on `__typename`. */
export type QuestionItemV2 =
  | ({ __typename: 'Condition' } & QuestionConditionV2Node)
  | {
      __typename: 'ConditionGroup';
      id: string;
      createdAt: string;
      name: string;
      category?: { name: string; slug: string } | null;
      conditions?: { nodes?: QuestionConditionV2Node[] } | null;
    };

type QuestionsV2Response = {
  questions: {
    edges: Array<{ cursor: string; node: QuestionItemV2 }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

function toFeedCondition(
  node: QuestionConditionV2Node,
  conditionGroupId: string | null
): ConditionGroupConditionType {
  return {
    id: node.conditionId,
    createdAt: node.createdAt,
    question: node.question,
    shortName: node.shortName ?? null,
    optionName: node.optionName ?? null,
    endTime: Number(node.endTime),
    public: node.isPublic,
    description: node.description,
    similarMarkets: node.similarMarket?.markets ?? [],
    chainId: node.chainId,
    resolver: node.resolver ?? null,
    settled: node.settled,
    resolvedToYes: node.resolvedToYes,
    nonDecisive: node.nonDecisive,
    openInterest: String(node.openInterest ?? '0'),
    estimatedPrice: node.estimatedPrice ?? null,
    similarMarketVolume: node.similarMarketVolume,
    similarMarketImage: node.similarMarket?.image ?? null,
    similarMarketVolume1h: node.similarMarketVolume1h,
    similarMarketVolume4h: node.similarMarketVolume4h,
    similarMarketVolume24h: node.similarMarketVolume24h,
    similarMarketVolume7d: node.similarMarketVolume7d,
    similarMarketVolumeFiltered1h: node.similarMarketVolumeFiltered1h,
    similarMarketVolumeFiltered4h: node.similarMarketVolumeFiltered4h,
    similarMarketVolumeFiltered24h: node.similarMarketVolumeFiltered24h,
    similarMarketVolumeFiltered7d: node.similarMarketVolumeFiltered7d,
    conditionGroupId,
    displayOrder: node.displayOrder ?? null,
    category: node.category
      ? { name: node.category.name, slug: node.category.slug }
      : null,
  };
}

/**
 * Rebuilds the v1 `QuestionType` envelope from a v2 `QuestionItem` union
 * node so feed consumers (MarketsPage / QuestionsTable / market-helpers)
 * keep their `questionType` + `condition` / `group` reads unchanged.
 */
export function toQuestionType(node: QuestionItemV2): QuestionType {
  if (node.__typename === 'ConditionGroup') {
    return {
      questionType: 'group',
      group: {
        id: node.id,
        createdAt: node.createdAt,
        name: node.name,
        category: node.category
          ? { name: node.category.name, slug: node.category.slug }
          : null,
        conditions: (node.conditions?.nodes ?? []).map((c) =>
          toFeedCondition(c, node.id)
        ),
      },
      condition: null,
    };
  }
  return {
    questionType: 'condition',
    condition: toFeedCondition(node, null),
    group: null,
  };
}

/**
 * v1-compatible offset fetch over the v2 cursor connection: over-fetch
 * `take + skip` (capped at the server's maxTake) and slice locally.
 * Cursor-native consumers should drive `GET_QUESTIONS` directly with
 * `buildQuestionsVariables` + `toQuestionType` instead.
 */
export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  const { take, skip, ...feedParams } = params;
  const { filter, orderBy } = buildQuestionsVariables(feedParams);

  const data = await graphqlRequestV2<QuestionsV2Response>(GET_QUESTIONS, {
    first: Math.min(take + skip, V2_MAX_FIRST),
    after: null,
    filter,
    orderBy,
  });

  const edges = data?.questions?.edges;
  if (!Array.isArray(edges)) {
    throw new Error('Failed to fetch questions: Invalid response structure');
  }

  return edges
    .map((edge) => toQuestionType(edge.node))
    .slice(skip, skip + take);
}
