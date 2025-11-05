import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export interface ConditionType {
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
  claimStatement: string;
  description: string;
  similarMarkets: string[];
  chainId: number;
  category?: { id: number; name: string; slug: string } | null;
}

const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($take: Int, $skip: Int, $chainId: Int) {
    conditions(
      orderBy: { createdAt: desc }
      take: $take
      skip: $skip
      where: { chainId: { equals: $chainId } }
    ) {
      id
      createdAt
      question
      shortName
      endTime
      public
      claimStatement
      description
      similarMarkets
      chainId
      category {
        id
        name
        slug
      }
    }
  }
`;

export const useConditions = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
}) => {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;

  return useQuery<ConditionType[], Error>({
    queryKey: ['conditions', take, skip, chainId],
    queryFn: async (): Promise<ConditionType[]> => {
      type ConditionsQueryResult = { conditions: ConditionType[] };
      const variables = {
        take,
        skip,
        ...(chainId !== undefined ? { chainId } : {}),
      };

      console.log('[useConditions] GraphQL variables:', variables);

      const data = await graphqlRequest<ConditionsQueryResult>(
        GET_CONDITIONS,
        variables
      );

      return data.conditions ?? [];
    },
  });
};
