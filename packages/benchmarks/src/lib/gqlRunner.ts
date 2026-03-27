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

const SORT_FIELDS = ['openInterest', 'endTime', 'createdAt', 'predictionCount'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomizeParams() {
  return {
    take: randomInt(10, 50),
    skip: randomInt(0, 100),
    sortField: randomElement(SORT_FIELDS),
    sortDirection: randomElement(SORT_DIRECTIONS),
    resolutionStatus: 'unresolved',
  };
}

export { GET_QUESTIONS };

export interface GqlResult {
  durationMs: number;
  success: boolean;
  error?: string;
  itemCount: number;
  rawQuestions?: unknown[];
  variables?: ReturnType<typeof randomizeParams>;
}

export async function runGqlQuery(apiUrl: string, params: ReturnType<typeof randomizeParams>): Promise<GqlResult> {
  const start = performance.now();
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GET_QUESTIONS, variables: params }),
    });
    const durationMs = performance.now() - start;

    if (!res.ok) {
      return { durationMs, success: false, error: `HTTP ${res.status}`, itemCount: 0, variables: params };
    }

    const json = await res.json();
    if (json.errors) {
      return { durationMs, success: false, error: json.errors[0]?.message ?? 'GQL error', itemCount: 0, variables: params };
    }

    const questions = json.data?.questions ?? [];
    return { durationMs, success: true, itemCount: questions.length, rawQuestions: questions, variables: params };
  } catch (err) {
    const durationMs = performance.now() - start;
    return { durationMs, success: false, error: (err as Error).message, itemCount: 0, variables: params };
  }
}

/** Fetch questions once and return the raw response data for condition extraction */
export async function fetchQuestionsOnce(apiUrl: string) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: GET_QUESTIONS,
      variables: {
        take: 50,
        skip: 0,
        sortField: 'openInterest',
        sortDirection: 'desc',
        resolutionStatus: 'unresolved',
      },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'GQL error');
  return json.data?.questions ?? [];
}
