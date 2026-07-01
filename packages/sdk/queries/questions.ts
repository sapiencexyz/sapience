import { graphqlRequest } from './client/graphqlClient';
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

/** Map friendly VolumeWindow values to `VolumeWindow` enum keys. */
const VOLUME_WINDOW_TO_API: Record<VolumeWindow, string> = {
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
 * The volume window is packed into the sort enum (`QuestionOrderField`)
 * rather than a separate `sortField + similarMarketVolumeWindow` pair.
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

const SORT_FIELD_TO_API: Record<
  Exclude<SortField, 'similarMarketVolume'>,
  string
> = {
  openInterest: 'OPEN_INTEREST',
  endTime: 'END_TIME',
  createdAt: 'CREATED_AT',
  predictionCount: 'PREDICTION_COUNT',
};

const RESOLUTION_STATUS_TO_API: Record<ResolutionStatusValue, string> = {
  all: 'ALL',
  unresolved: 'UNRESOLVED',
  resolved: 'RESOLVED',
  resolvedYes: 'RESOLVED_YES',
  resolvedNo: 'RESOLVED_NO',
};

/** The questions connection's max page size. */
const MAX_PAGE_SIZE = 25;

/**
 * Shared Condition selection for both union members. The feed reads the
 * flat windowed-volume mirror columns on the Condition because
 * `market-helpers` string-indexes them for client-side filters.
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
 * Interleaved Condition + ConditionGroup feed.
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
            conditions(first: 25) {
              nodes {
                ${QUESTION_CONDITION_FIELDS}
                displayOrder
              }
              pageInfo {
                hasNextPage
                endCursor
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
 * Maps the stable feed params onto `QuestionFilter` + `QuestionOrder`.
 * orderBy is always explicit.
 *
 * Windowed volume sorts pack the window into the order-field enum. The
 * windowless `similarMarketVolume` sort has no all-time counterpart on the
 * server — `SIMILAR_MARKET_VOLUME_7D` is the documented closest proxy
 * (follow-up if the server grows an all-time variant).
 */
export function buildQuestionsVariables(
  params: QuestionFeedParams
): QuestionsVariables {
  const direction = params.sortDirection === 'asc' ? 'ASC' : 'DESC';
  const orderBy: QuestionsVariables['orderBy'] = {
    field:
      params.sortField === 'similarMarketVolume'
        ? VOLUME_WINDOW_TO_ORDER_FIELD[params.similarMarketVolumeWindow ?? '7d']
        : SORT_FIELD_TO_API[params.sortField],
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
      RESOLUTION_STATUS_TO_API[
        params.resolutionStatus as ResolutionStatusValue
      ];
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
      VOLUME_WINDOW_TO_API[params.similarMarketVolumeWindow];
  }

  return {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    orderBy,
  };
}

type QuestionConditionNode = {
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

/** Raw `QuestionItem` union node — discriminate on `__typename`. */
export type QuestionItem =
  | ({ __typename: 'Condition' } & QuestionConditionNode)
  | {
      __typename: 'ConditionGroup';
      id: string;
      createdAt: string;
      name: string;
      category?: { name: string; slug: string } | null;
      conditions?: {
        nodes?: QuestionConditionNode[];
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      } | null;
    };

type QuestionsResponse = {
  questions: {
    edges: Array<{ cursor: string; node: QuestionItem }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

function toFeedCondition(
  node: QuestionConditionNode,
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
 * Rebuilds the `QuestionType` envelope from a `QuestionItem` union
 * node so feed consumers (MarketsPage / QuestionsTable / market-helpers)
 * keep their `questionType` + `condition` / `group` reads unchanged.
 */
export function toQuestionType(node: QuestionItem): QuestionType {
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
        hasMoreConditions: Boolean(node.conditions?.pageInfo?.hasNextPage),
        conditionsEndCursor: node.conditions?.pageInfo?.endCursor ?? null,
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
 * Offset fetch over the cursor connection: page until `take + skip` rows
 * are available, then slice locally.
 * Cursor-native consumers should drive `GET_QUESTIONS` directly with
 * `buildQuestionsVariables` + `toQuestionType` instead.
 */
export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  const { take, skip, ...feedParams } = params;
  const { filter, orderBy } = buildQuestionsVariables(feedParams);

  const target = skip + take;
  const items: QuestionItem[] = [];
  let after: string | null = null;

  while (items.length < target) {
    const data: QuestionsResponse = await graphqlRequest<QuestionsResponse>(
      GET_QUESTIONS,
      {
        first: Math.min(target - items.length, MAX_PAGE_SIZE),
        after,
        filter,
        orderBy,
      }
    );

    const edges = data?.questions?.edges;
    if (!Array.isArray(edges)) {
      throw new Error('Failed to fetch questions: Invalid response structure');
    }
    items.push(...edges.map((edge) => edge.node));
    const pageInfo = data.questions.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return items.map(toQuestionType).slice(skip, skip + take);
}
