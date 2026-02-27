import { graphqlRequest } from './client/graphqlClient';
import type { ConditionType } from './conditions';
import type { ConditionGroupType } from './conditionGroups';

export type SortField = 'openInterest' | 'endTime' | 'createdAt' | 'predictionCount';
export type SortDirection = 'asc' | 'desc';
export type ResolutionStatusValue = 'all' | 'unresolved' | 'resolvedYes' | 'resolvedNo';

export interface QuestionType {
  questionType: 'group' | 'condition';
  group?: ConditionGroupType | null;
  condition?: ConditionType | null;
}

/** Map camelCase sort field to GraphQL QuestionSortField enum key */
const SORT_FIELD_TO_ENUM: Record<SortField, string> = {
  openInterest: 'OPEN_INTEREST',
  endTime: 'END_TIME',
  createdAt: 'CREATED_AT',
  predictionCount: 'PREDICTION_COUNT',
};

/** Map camelCase resolution status to GraphQL ResolutionStatus enum key */
const RESOLUTION_STATUS_TO_ENUM: Record<string, string> = {
  all: 'ALL',
  unresolved: 'UNRESOLVED',
  resolvedYes: 'RESOLVED_YES',
  resolvedNo: 'RESOLVED_NO',
};

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
          claimStatement
          description
          similarMarkets
          chainId
          resolver
          settled
          resolvedToYes
          assertionId
          assertionTimestamp
          openInterest
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
        claimStatement
        description
        similarMarkets
        chainId
        resolver
        settled
        resolvedToYes
        assertionId
        assertionTimestamp
        openInterest
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
    sortField: SORT_FIELD_TO_ENUM[params.sortField] ?? params.sortField,
    sortDirection: params.sortDirection,
    search: params.search?.trim() || null,
    categorySlugs: params.categorySlugs?.length ? params.categorySlugs : null,
    minEndTime: params.minEndTime ?? null,
    resolutionStatus: params.resolutionStatus
      ? (RESOLUTION_STATUS_TO_ENUM[params.resolutionStatus] ?? params.resolutionStatus)
      : null,
  };

  const data = await graphqlRequest<QuestionsQueryResult>(
    GET_QUESTIONS,
    variables
  );

  // Normalize GraphQL enum response (UPPER_CASE) to camelCase for consumers
  return (data.questions ?? []).map((q) => ({
    ...q,
    questionType: q.questionType.toLowerCase() as 'group' | 'condition',
  }));
}
