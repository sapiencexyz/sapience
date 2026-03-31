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
export type ResolutionStatusValue =
  | 'all'
  | 'unresolved'
  | 'resolvedYes'
  | 'resolvedNo';

export interface QuestionType {
  questionType: 'group' | 'condition';
  group?: ConditionGroupType | null;
  condition?: ConditionType | null;
}

const GET_QUESTIONS = /* GraphQL */ `
  query Questions(
    $take: Int!
    $skip: Int!
    $chainId: Int
    $sortField: QuestionSortField!
    $sortDirection: SortOrder!
    $search: String
    $categorySlugs: [String!]
    $minEndTime: Int
    $resolutionStatus: ResolutionStatus
    $minEstimatedPrice: Float
    $maxEstimatedPrice: Float
    $tag: String
  ) {
    questions(
      take: $take
      skip: $skip
      chainId: $chainId
      sortField: $sortField
      sortDirection: $sortDirection
      search: $search
      categorySlugs: $categorySlugs
      minEndTime: $minEndTime
      resolutionStatus: $resolutionStatus
      minEstimatedPrice: $minEstimatedPrice
      maxEstimatedPrice: $maxEstimatedPrice
      tag: $tag
    ) {
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
          estimatedPrice
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
        estimatedPrice
        conditionGroupId
        category {
          id
          name
          slug
        }
      }
    }
  }
`;

export interface FetchQuestionsSortedParams {
  take: number;
  skip: number;
  chainId?: number;
  sortField: SortField;
  sortDirection: SortDirection;
  search?: string;
  categorySlugs?: string[];
  minEndTime?: number;
  resolutionStatus?: string;
  minEstimatedPrice?: number;
  maxEstimatedPrice?: number;
  tag?: string;
}

export async function fetchQuestionsSorted(
  params: FetchQuestionsSortedParams
): Promise<QuestionType[]> {
  type QuestionsQueryResult = {
    questions: QuestionType[];
  };
  const variables = {
    take: params.take,
    skip: params.skip,
    chainId: params.chainId ?? null,
    sortField: params.sortField,
    sortDirection: params.sortDirection,
    search: params.search?.trim() || null,
    categorySlugs: params.categorySlugs?.length ? params.categorySlugs : null,
    minEndTime: params.minEndTime ?? null,
    resolutionStatus: params.resolutionStatus ?? null,
    minEstimatedPrice: params.minEstimatedPrice ?? null,
    maxEstimatedPrice: params.maxEstimatedPrice ?? null,
    tag: params.tag ?? null,
  };

  const data = await graphqlRequest<QuestionsQueryResult>(
    GET_QUESTIONS,
    variables
  );

  return data.questions ?? [];
}
