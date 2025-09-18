import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

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
  category?: { id: number; name: string; slug: string } | null;
}

const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($take: Int, $skip: Int) {
    conditions(orderBy: { createdAt: desc }, take: $take, skip: $skip) {
      id
      createdAt
      question
      shortName
      endTime
      public
      claimStatement
      description
      similarMarkets
      category {
        id
        name
        slug
      }
    }
  }
`;

export const useConditions = (opts?: { take?: number; skip?: number }) => {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  return useQuery<ConditionType[], Error>({
    queryKey: ['conditions', take, skip],
    queryFn: async (): Promise<ConditionType[]> => {
      type ConditionsQueryResult = { conditions: ConditionType[] };
      const data = await graphqlRequest<ConditionsQueryResult>(GET_CONDITIONS, {
        take,
        skip,
      });
      return data.conditions ?? [];
    },
  });
};
