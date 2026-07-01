import { graphqlRequest } from './client/graphqlClient';
import { paginateConnection } from './pagination';

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
  const nodes = await paginateConnection<{ name: string; slug: string }>({
    fetchPage: async ({ after }) => {
      const data: CategoriesResponse | null =
        await graphqlRequest<CategoriesResponse>(GET_CATEGORIES, { after });
      return {
        nodes: toCategoryNodes(data),
        pageInfo: data?.categories?.pageInfo,
      };
    },
  });

  return nodes.map(({ name, slug }) => ({ name, slug }));
}
