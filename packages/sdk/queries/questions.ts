import { graphqlRequest } from './client/graphqlClient';
import type { ConditionType } from './conditions';
import type { ConditionGroupType } from './conditionGroups';

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

const VOLUME_WINDOW_TO_GQL: Record<VolumeWindow, string> = {
  '1h': 'oneHour',
  '4h': 'fourHours',
  '24h': 'twentyFourHours',
  '7d': 'sevenDays',
  '1hFiltered': 'oneHourFiltered',
  '4hFiltered': 'fourHoursFiltered',
  '24hFiltered': 'twentyFourHoursFiltered',
  '7dFiltered': 'sevenDaysFiltered',
};

const SORT_FIELD_TO_ORDER_FIELD: Record<SortField, string> = {
  createdAt: 'CREATED_AT',
  endTime: 'RESOLVES_AT',
  openInterest: 'OPEN_INTEREST',
  predictionCount: 'PREDICTION_COUNT',
  similarMarketVolume: 'SIMILAR_MARKET_VOLUME_24H',
};

const getQuestionOrderField = (
  sortField: SortField,
  similarMarketVolumeWindow?: VolumeWindow
): string => {
  if (sortField !== 'similarMarketVolume') {
    return SORT_FIELD_TO_ORDER_FIELD[sortField];
  }

  // The API exposes 24h and 7d volume sort keys today. Keep unsupported
  // 1h/4h windows on the previous 24h sort while preserving their filter.
  return similarMarketVolumeWindow === '7d' ||
    similarMarketVolumeWindow === '7dFiltered'
    ? 'SIMILAR_MARKET_VOLUME_7D'
    : 'SIMILAR_MARKET_VOLUME_24H';
};

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

export const GET_QUESTIONS = /* GraphQL */ `
  query Questions(
    $take: Int!
    $after: String
    $orderBy: QuestionOrder
    $filter: QuestionFilter
  ) {
    questionsConnection(
      first: $take
      after: $after
      orderBy: $orderBy
      filter: $filter
    ) {
      nodes {
        questionType
        group {
          id
          createdAt
          name
          category {
            id
            name
            slug
          }
          conditions {
            id: conditionId
            conditionId
            createdAt
            question
            shortName
            optionName
            endTime
            public
            description
            similarMarkets
            tags
            chainId
            resolver
            settled
            resolvedToYes
            nonDecisive
            assertionId
            assertionTimestamp
            openInterest
            similarMarketVolume
            similarMarketImage
            estimatedPrice
            similarMarketVolume1h
            similarMarketVolume4h
            similarMarketVolume24h
            similarMarketVolume7d
            similarMarketVolumeFiltered1h
            similarMarketVolumeFiltered4h
            similarMarketVolumeFiltered24h
            similarMarketVolumeFiltered7d
            conditionGroupId
            category {
              id
              name
              slug
            }
            displayOrder
          }
        }
        condition {
          id: conditionId
          conditionId
          createdAt
          question
          shortName
          endTime
          public
          description
          similarMarkets
          tags
          chainId
          resolver
          settled
          resolvedToYes
          nonDecisive
          assertionId
          assertionTimestamp
          openInterest
          similarMarketVolume
          similarMarketImage
          estimatedPrice
          similarMarketVolume1h
          similarMarketVolume4h
          similarMarketVolume24h
          similarMarketVolume7d
          similarMarketVolumeFiltered1h
          similarMarketVolumeFiltered4h
          similarMarketVolumeFiltered24h
          similarMarketVolumeFiltered7d
          conditionGroupId
          category {
            id
            name
            slug
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

export interface FetchQuestionsSortedParams {
  take: number;
  skip: number;
  chainId?: number;
  marketAddress?: string;
  marketAddressIn?: string[];
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

type QuestionsQueryResult = {
  questionsConnection?: {
    nodes?: QuestionType[] | null;
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
  } | null;
};

export interface QuestionsPageResult {
  items: QuestionType[];
  hasMore: boolean;
}

function buildQuestionFilter(params: FetchQuestionsSortedParams) {
  return {
    chainId: params.chainId ?? null,
    marketAddress: params.marketAddress ?? null,
    marketAddressIn: params.marketAddressIn?.length
      ? params.marketAddressIn
      : null,
    search: params.search?.trim() || null,
    categorySlugs: params.categorySlugs?.length ? params.categorySlugs : null,
    resolvesAt: params.minEndTime != null ? { gte: params.minEndTime } : null,
    resolutionStatus: params.resolutionStatus ?? null,
    estimatedPrice:
      params.minEstimatedPrice != null || params.maxEstimatedPrice != null
        ? {
            ...(params.minEstimatedPrice != null
              ? { gte: params.minEstimatedPrice }
              : {}),
            ...(params.maxEstimatedPrice != null
              ? { lte: params.maxEstimatedPrice }
              : {}),
          }
        : null,
    similarMarketVolume:
      params.minSimilarMarketVolume != null ||
      params.maxSimilarMarketVolume != null
        ? {
            ...(params.minSimilarMarketVolume != null
              ? { gte: params.minSimilarMarketVolume }
              : {}),
            ...(params.maxSimilarMarketVolume != null
              ? { lte: params.maxSimilarMarketVolume }
              : {}),
          }
        : null,
    tag: params.tag ?? null,
    similarMarketVolumeWindow: params.similarMarketVolumeWindow
      ? VOLUME_WINDOW_TO_GQL[params.similarMarketVolumeWindow]
      : null,
  };
}

export async function fetchQuestionsPage(
  params: FetchQuestionsSortedParams
): Promise<QuestionsPageResult> {
  const target = params.skip + params.take;
  const collected: QuestionType[] = [];
  let after: string | null | undefined = null;
  let hasMore = false;

  while (collected.length < target) {
    const first = Math.min(100, target - collected.length);
    const data: QuestionsQueryResult =
      await graphqlRequest<QuestionsQueryResult>(GET_QUESTIONS, {
        take: first,
        after,
        orderBy: {
          field: getQuestionOrderField(
            params.sortField,
            params.similarMarketVolumeWindow
          ),
          direction: params.sortDirection.toUpperCase(),
        },
        filter: buildQuestionFilter(params),
      });
    const conn = data.questionsConnection;
    const nodes = conn?.nodes ?? [];
    collected.push(...nodes);
    hasMore = Boolean(conn?.pageInfo?.hasNextPage);
    if (!hasMore || !conn?.pageInfo?.endCursor || nodes.length === 0) break;
    after = conn.pageInfo.endCursor;
  }

  return {
    items: collected.slice(params.skip, target),
    hasMore,
  };
}

export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  const page = await fetchQuestionsPage(params);
  return page.items;
}
