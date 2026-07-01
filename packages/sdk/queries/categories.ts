import { graphqlRequest } from './client/graphqlClient';

export type CategoryQueryResult = {
  name: string;
  slug: string;
};

type CategoriesResponse = {
  categories: {
    nodes: Array<{ name: string; slug: string }>;
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

export const GET_CATEGORIES = /* GraphQL */ `
  query Categories($after: String) {
    categories(
      first: 25
      after: $after
      orderBy: { field: NAME, direction: ASC }
    ) {
      nodes {
        name
        slug
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function toCategoryNodes(
  data: CategoriesResponse | null
): Array<{ name: string; slug: string }> {
  const nodes = data?.categories?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('Failed to fetch categories: Invalid response structure');
  }
  return nodes;
}

export async function fetchCategories(): Promise<CategoryQueryResult[]> {
  const nodes: Array<{ name: string; slug: string }> = [];
  let after: string | null = null;

  // Loop over 25-row cursor pages until the server reports no more, so we
  // never drop categories under the server-side page cap.
  while (true) {
    const data: CategoriesResponse | null =
      await graphqlRequest<CategoriesResponse>(GET_CATEGORIES, { after });
    nodes.push(...toCategoryNodes(data));
    const pageInfo:
      | { hasNextPage: boolean; endCursor: string | null }
      | undefined = data?.categories?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return nodes.map(({ name, slug }) => ({ name, slug }));
}
