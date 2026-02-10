import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

const TAKE_SIZE = 100;
const MAX_CONCURRENT_REQUESTS = 3;

export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[],
  resultKey = 'conditions'
): Promise<T[]> {
  if (ids.length === 0) return [];
  if (ids.length <= TAKE_SIZE) {
    const resp = await graphqlRequest<Record<string, T[]>>(query, {
      where: { id: { in: ids } },
    });
    return resp?.[resultKey] ?? [];
  }

  // Split into chunks of TAKE_SIZE
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += TAKE_SIZE) {
    chunks.push(ids.slice(i, i + TAKE_SIZE));
  }

  // Process chunks with concurrency limit to avoid overwhelming the API
  const results: T[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const batchResults = await Promise.all(
      batch.map((chunk) =>
        graphqlRequest<Record<string, T[]>>(query, {
          where: { id: { in: chunk } },
        })
      )
    );
    results.push(...batchResults.map((r) => r?.[resultKey] ?? []));
  }

  return results.flat();
}
