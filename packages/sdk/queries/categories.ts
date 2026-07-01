import { graphqlRequest } from './client/graphqlClient';

export type CategoryQueryResult = {
  name: string;
  slug: string;
};

type CategoriesResponse = {
  categories: {
    nodes: Array<{ name: string; slug: string }>;
  };
};

export const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories(first: 25, orderBy: { field: NAME, direction: ASC }) {
      nodes {
        name
        slug
      }
    }
  }
`;

function toCategoryQueryResults(
  data: CategoriesResponse | null
): CategoryQueryResult[] {
  const nodes = data?.categories?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('Failed to fetch categories: Invalid response structure');
  }
  return nodes.map(({ name, slug }) => ({ name, slug }));
}

export async function fetchCategories(): Promise<CategoryQueryResult[]> {
  const data = await graphqlRequest<CategoriesResponse>(GET_CATEGORIES);
  return toCategoryQueryResults(data);
}
