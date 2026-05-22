import {
  clampConnectionTake,
  fetchConnectionPage,
  fetchConnectionWindow,
  shouldFetchConnectionWindow,
} from './connectionPage';
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
  /** @deprecated Use `after` with `endCursor` from `fetchQuestionsPage`. */
  skip?: number;
  /**
   * Opaque cursor from the previous page's `endCursor`. Pass `null` (or
   * omit) to fetch the first page. Cursor pagination keeps server cost
   * constant per page — the resolver enforces a query-complexity ceiling
   * that an offset-style "refetch with larger first" pattern blows past
   * within a couple of scrolls.
   */
  after?: string | null;
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

export interface QuestionsPageResult {
  items: QuestionType[];
  hasMore: boolean;
  endCursor: string | null;
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

function buildQuestionsVariables(
  params: FetchQuestionsSortedParams,
  take: number,
  after: string | null
) {
  return {
    take,
    after,
    orderBy: {
      field: getQuestionOrderField(
        params.sortField,
        params.similarMarketVolumeWindow
      ),
      direction: params.sortDirection.toUpperCase(),
    },
    filter: buildQuestionFilter(params),
  };
}

export async function fetchQuestionsPage(
  params: FetchQuestionsSortedParams
): Promise<QuestionsPageResult> {
  if (shouldFetchConnectionWindow(params.take, params.skip, params.after, 50)) {
    return fetchConnectionWindow<QuestionType>(
      GET_QUESTIONS,
      (take, after) => buildQuestionsVariables(params, take, after),
      'questionsConnection',
      { take: params.take, skip: params.skip, defaultTake: 50 }
    );
  }

  return fetchConnectionPage<QuestionType>(
    GET_QUESTIONS,
    buildQuestionsVariables(
      params,
      clampConnectionTake(params.take),
      params.after ?? null
    ),
    'questionsConnection'
  );
}

export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  const page = await fetchQuestionsPage(params);
  return page.items;
}
