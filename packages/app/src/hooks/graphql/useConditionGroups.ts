import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export interface ConditionGroupConditionType {
  id: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
  displayOrder?: number | null;
}

export interface ConditionGroupType {
  id: number;
  createdAt: string;
  name: string;
  category?: { id: number; name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
}

const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups($take: Int, $skip: Int) {
    conditionGroups(orderBy: { createdAt: desc }, take: $take, skip: $skip) {
      id
      createdAt
      name
      category {
        id
        name
        slug
      }
      conditions(orderBy: { displayOrder: asc }) {
        id
        question
        shortName
        endTime
        public
        displayOrder
      }
    }
  }
`;

export const useConditionGroups = (opts?: { take?: number; skip?: number }) => {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;

  return useQuery<ConditionGroupType[], Error>({
    queryKey: ['conditionGroups', take, skip],
    queryFn: async (): Promise<ConditionGroupType[]> => {
      type ConditionGroupsQueryResult = {
        conditionGroups: ConditionGroupType[];
      };
      const variables = { take, skip };

      const data = await graphqlRequest<ConditionGroupsQueryResult>(
        GET_CONDITION_GROUPS,
        variables
      );

      return data.conditionGroups ?? [];
    },
  });
};
