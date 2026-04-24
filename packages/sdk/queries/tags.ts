import { graphqlRequest } from './client/graphqlClient';

export const GET_POPULAR_TAGS = /* GraphQL */ `
  query PopularTags {
    popularTags
  }
`;

export async function fetchPopularTags(): Promise<string[]> {
  type PopularTagsResult = { popularTags: string[] };
  const data = await graphqlRequest<PopularTagsResult>(GET_POPULAR_TAGS);
  return data.popularTags ?? [];
}
