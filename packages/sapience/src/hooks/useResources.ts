'use client';

import { useQuery } from '@tanstack/react-query';
import { GraphQLClient } from 'graphql-request';

type Resource = {
  id: number;
  name: string;
  slug: string;
  marketGroups: Array<{
    id: number;
    address: string;
    isBridged: boolean;
    chainId: number;
    markets: Array<{
      id: number;
      marketId: string;
      startTimestamp: number;
      endTimestamp: number;
      public: boolean;
      question: string;
    }>;
  }>;
};

const RESOURCES_QUERY = /* GraphQL */ `
  query Resources {
    resources {
      id
      name
      slug
      marketGroups {
        id
        address
        isBridged
        chainId
        markets {
          id
          marketId
          startTimestamp
          endTimestamp
          public
          question
        }
      }
    }
  }
`;

const getGraphQLEndpoint = () => {
  try {
    if (typeof window !== 'undefined') {
      const override = window.localStorage.getItem(
        'sapience.settings.graphqlEndpoint'
      );
      if (override) return override;
    }
  } catch {
    /* noop */
  }
  const baseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL;
  if (baseUrl) return `${baseUrl}/graphql`;
  if (typeof window !== 'undefined') return `${window.location.origin}/graphql`;
  return 'http://localhost:3001/graphql';
};

export const useResources = () => {
  return useQuery<(Resource & { iconPath: string })[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const client = new GraphQLClient(getGraphQLEndpoint());
      const data = await client.request<{ resources: Resource[] }>(
        RESOURCES_QUERY
      );

      // Keep existing order semantics if present in UI
      const resources = data.resources;

      return resources.map((resource) => ({
        ...resource,
        iconPath: `/resources/${resource.slug}.svg`,
      }));
    },
  });
};
