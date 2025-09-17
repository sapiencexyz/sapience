import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import type { Position as PositionType } from '@sapience/ui/types/graphql';

// GraphQL query to fetch positions by owner address and optional market address
export const POSITIONS_QUERY = /* GraphQL */ `
  query Positions($owner: String, $marketAddress: String) {
    positions(
      where: {
        market: {
          is: { marketGroup: { is: { address: { equals: $marketAddress } } } }
        }
        owner: { equals: $owner }
      }
    ) {
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
      createdAt
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
        marketParamsUniswappositionmanager
        marketGroup {
          id
          chainId
          address
          question
          collateralSymbol
          collateralDecimals
          marketParamsUniswappositionmanager
          markets {
            id
          }
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
        createdAt
        collateral
        collateralTransfer {
          collateral
        }
        event {
          transactionHash
        }
      }
    }
  }
`;

// GraphQL query to fetch all positions by market group (no owner filter)
export const ALL_POSITIONS_QUERY = /* GraphQL */ `
  query AllPositions($marketAddress: String) {
    positions(
      where: {
        market: {
          is: { marketGroup: { is: { address: { equals: $marketAddress } } } }
        }
      }
    ) {
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
      createdAt
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
        marketParamsUniswappositionmanager
        marketGroup {
          id
          chainId
          address
          question
          collateralSymbol
          collateralDecimals
          marketParamsUniswappositionmanager
          markets {
            id
          }
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
        createdAt
        collateral
        collateralTransfer {
          collateral
        }
        event {
          transactionHash
        }
      }
    }
  }
`;

interface UsePositionsProps {
  address?: string; // Made optional
  marketAddress?: string;
  chainId?: number; // Added chainId for fetching all market data
}

export function usePositions({ address, marketAddress }: UsePositionsProps) {
  return useQuery<PositionType[]>({
    queryKey: ['positions', address, marketAddress],
    queryFn: async () => {
      // Build variables object
      const variables: {
        owner?: string;
        marketAddress?: string;
      } = {};

      // Add owner if address is provided
      if (address && address.trim() !== '') {
        variables.owner = address.toLowerCase();
      }

      // Add marketAddress if provided
      if (marketAddress && marketAddress.trim() !== '') {
        variables.marketAddress = marketAddress;
      }

      type PositionsQueryResult = {
        positions: PositionType[];
      };

      const data = await graphqlRequest<PositionsQueryResult>(
        POSITIONS_QUERY,
        variables
      );
      return data.positions || [];
    },

    // Enable query if we have either an address OR a marketAddress
    enabled: Boolean(address) || Boolean(marketAddress),
    staleTime: 30000, // 30 seconds
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useAllPositions({ marketAddress }: { marketAddress?: string }) {
  return useQuery<PositionType[]>({
    queryKey: ['positions-all', marketAddress],
    queryFn: async () => {
      const variables: { marketAddress?: string } = {};
      if (marketAddress && marketAddress.trim() !== '') {
        variables.marketAddress = marketAddress;
      }

      type PositionsQueryResult = {
        positions: PositionType[];
      };

      const data = await graphqlRequest<PositionsQueryResult>(
        ALL_POSITIONS_QUERY,
        variables
      );
      return data.positions || [];
    },
    enabled: Boolean(marketAddress),
    staleTime: 30000,
    refetchInterval: 10000,
  });
}
