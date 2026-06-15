import { graphqlRequestV2 } from './client/graphqlClient';

type PopularTagsV2Response = {
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

function toTagNames(data: PopularTagsV2Response | null): string[] {
  return (data?.tags?.nodes ?? []).map((node) => node.name);
}

export async function fetchPopularTags(): Promise<string[]> {
  const data = await graphqlRequestV2<PopularTagsV2Response>(GET_POPULAR_TAGS);
  return toTagNames(data);
}
