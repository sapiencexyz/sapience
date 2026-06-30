import { graphqlRequest } from './client/graphqlClient';

type PopularTagsResponse = {
  tags: {
    nodes: Array<{ name: string }>;
  };
};

export const GET_POPULAR_TAGS = /* GraphQL */ `
  query PopularTags {
    tags(first: 20, orderBy: { field: CONDITION_COUNT, direction: DESC }) {
      nodes {
        name
      }
    }
  }
`;

function toTagNames(data: PopularTagsResponse | null): string[] {
  return (data?.tags?.nodes ?? []).map((node) => node.name);
}

export async function fetchPopularTags(): Promise<string[]> {
  const data = await graphqlRequest<PopularTagsResponse>(GET_POPULAR_TAGS);
  return toTagNames(data);
}
