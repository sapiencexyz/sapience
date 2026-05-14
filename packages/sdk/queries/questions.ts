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

/** Map friendly VolumeWindow values to GraphQL enum keys */
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
    $skip: Int!
    $orderBy: QuestionSortField!
    $orderDirection: SortOrder!
    $filters: QuestionFilters
  ) {
    questionsPage(
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      filters: $filters
    ) {
      items {
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
            id
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
          id
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
    }
  }
`;

export interface FetchQuestionsSortedParams {
  take: number;
  skip: number;
  chainId?: number;
  /**
   * On-chain contract address (case-insensitive). When set without `chainId`,
   * the API defaults the chain to its `DEFAULT_CHAIN_ID`.
   */
  contractAddress?: string;
  /** Same as `contractAddress` but matches any address in the list. */
  contractAddressIn?: string[];
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

export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  type QuestionsQueryResult = {
    questionsPage: { items: QuestionType[] };
  };
  const variables = {
    take: params.take,
    skip: params.skip,
    orderBy: params.sortField,
    orderDirection: params.sortDirection,
    filters: {
      chainId: params.chainId ?? null,
      contractAddress: params.contractAddress ?? null,
      contractAddressIn: params.contractAddressIn?.length
        ? params.contractAddressIn
        : null,
      search: params.search?.trim() || null,
      categorySlugs: params.categorySlugs?.length ? params.categorySlugs : null,
      minEndTime: params.minEndTime ?? null,
      resolutionStatus: params.resolutionStatus ?? null,
      minEstimatedPrice: params.minEstimatedPrice ?? null,
      maxEstimatedPrice: params.maxEstimatedPrice ?? null,
      minSimilarMarketVolume: params.minSimilarMarketVolume ?? null,
      maxSimilarMarketVolume: params.maxSimilarMarketVolume ?? null,
      tag: params.tag ?? null,
      similarMarketVolumeWindow: params.similarMarketVolumeWindow
        ? VOLUME_WINDOW_TO_GQL[params.similarMarketVolumeWindow]
        : null,
    },
  };

  const data = await graphqlRequest<QuestionsQueryResult>(
    GET_QUESTIONS,
    variables
  );

  return data.questionsPage?.items ?? [];
}
