import { gql } from '@apollo/client';
import type { PositionType } from '@foil/ui/types';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { foilApi } from '~/lib/utils/util';

// GraphQL query to fetch positions by owner address and optional market address
export const POSITIONS_QUERY = gql`
  query GetPositions($owner: String!, $marketAddress: String) {
    positions(owner: $owner, marketAddress: $marketAddress) {
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

interface UsePositionsProps {
  address: string;
  marketAddress?: string;
}

export function usePositions({ address, marketAddress }: UsePositionsProps) {
  return useQuery<PositionType[]>({
    queryKey: ['positions', address, marketAddress],
    queryFn: async () => {
      // Build variables object, only including marketAddress if it exists and isn't empty
      const variables: { owner: string; marketAddress?: string } = {
        owner: address,
      };

      // Only add marketAddress to variables if it exists and isn't an empty string
      if (marketAddress && marketAddress.trim() !== '') {
        variables.marketAddress = marketAddress;
      }

      const { data, errors } = await foilApi.post('/graphql', {
        query: print(POSITIONS_QUERY),
        variables,
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      // If no marketAddress is provided, return all positions
      if (!marketAddress) {
        return data.positions;
      }

      // Only filter by marketAddress if one is provided
      return data.positions.filter((position: PositionType) => {
        // Check if position has market and marketGroup data
        if (!position.market || !position.market.marketGroup) return false;

        // Compare marketGroup.address with our marketAddress, ignoring case
        const groupAddress = position.market.marketGroup.address?.toLowerCase();
        return groupAddress === marketAddress.toLowerCase();
      });
    },
    enabled: Boolean(address),
    staleTime: 30000, // 30 seconds
  });
}
