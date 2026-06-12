/**
 * Fetch helper for refresh-imminent-tag: every public + unsettled
 * condition with its question and tags, via GraphQL.
 *
 * Sorted by createdAt **desc** (newest first). Two reasons:
 *  - The newest markets are the most likely to mention today's or tomorrow's
 *    date in the title — so a `--limit N` dry-run sample is much more
 *    likely to find matches than if we walked the oldest markets first.
 *  - Live runs are uncapped and visit every market, so direction doesn't
 *    affect correctness — only the sample shape for partial runs.
 */

import { log } from '../utils';
import { graphqlUrl, walkConnection, type Connection } from '../utils/graphql';

export interface PageItem {
  id: string;
  question: string;
  description: string;
  tags: string[];
}

const IMMINENT_TAG_CANDIDATES_QUERY = `
  query ImminentTagCandidates($first: Int!, $after: String, $filter: ConditionFilter) {
    conditions(
      first: $first
      after: $after
      filter: $filter
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        conditionId
        question
        description
        tags
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type CandidateNode = {
  conditionId: string;
  question: string;
  description: string | null;
  tags: string[] | null;
};

/**
 * When `maxResults` is non-null, stops once the cumulative count hits it.
 */
export async function fetchAllUnsettledConditions(
  apiUrl: string,
  maxResults: number | null
): Promise<PageItem[]> {
  const out: PageItem[] = [];
  let pageCount = 0;
  let pageStart = Date.now();

  await walkConnection<
    CandidateNode,
    { conditions: Connection<CandidateNode> }
  >({
    graphqlUrl: graphqlUrl(apiUrl),
    query: IMMINENT_TAG_CANDIDATES_QUERY,
    variables: { filter: { public: true, settled: false } },
    label: 'TodayTag',
    select: (data) => data.conditions,
    onPage: (nodes) => {
      pageCount++;
      for (const c of nodes) {
        out.push({
          id: c.conditionId,
          question: c.question,
          description: c.description ?? '',
          tags: c.tags ?? [],
        });
        if (maxResults !== null && out.length >= maxResults) {
          log(
            `[TodayTag]   page ${pageCount}: fetched ${nodes.length} (cumulative ${out.length}, ${Date.now() - pageStart}ms) — hit --limit ${maxResults}, stopping`
          );
          return false;
        }
      }
      log(
        `[TodayTag]   page ${pageCount}: fetched ${nodes.length} (cumulative ${out.length}, ${Date.now() - pageStart}ms)`
      );
      pageStart = Date.now();
    },
  });

  return out;
}
