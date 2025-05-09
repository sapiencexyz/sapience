import { gql } from '@apollo/client';
import type { PositionType } from '@foil/ui/types';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { foilApi } from '~/lib/utils/util';

// GraphQL query to fetch positions by owner address
export const POSITIONS_QUERY = gql`
  query GetPositions($owner: String!) {
    positions(owner: $owner) {
      id
      positionId
      owner
      baseToken
      quoteToken
      collateral
      borrowedBaseToken
      borrowedQuoteToken
      isLP
      isSettled
      highPriceTick
      lowPriceTick
      lpBaseToken
      lpQuoteToken
      market {
        id
        marketId
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        question
        optionName
        marketGroup {
          id
          chainId
          address
          question
          collateralSymbol
          collateralDecimals
          baseTokenName
          resource {
            name
            slug
          }
        }
      }
      transactions {
        id
        type
        timestamp
        transactionHash
      }
    }
  }
`;

export function usePositions(address: string) {
  return useQuery<PositionType[]>({
    queryKey: ['positions', address],
    queryFn: async () => {
      const { data, errors } = await foilApi.post('/graphql', {
        query: print(POSITIONS_QUERY),
        variables: {
          owner: address,
        },
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      return data.positions;
    },
    enabled: Boolean(address),
    staleTime: 30000, // 30 seconds
  });
}
