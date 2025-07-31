import { useMarketGroup } from './useMarketGroup';

interface MarketIdentifier {
  chainId: number;
  marketAddress: string;
  chainShortName: string;
}

export function useMultipleMarketGroups(markets: MarketIdentifier[]) {
  // Use a fixed number of hooks to avoid hooks rule violations
  // Most betslips will have <= 10 different markets

  // Helper to get market or fallback for unused slots
  const getMarket = (index: number) => {
    const market = markets[index];
    if (!market) {
      return { chainShortName: 'base', marketAddress: '' };
    }

    // Validate market data
    if (!market.chainShortName || !market.marketAddress) {
      console.warn('Invalid market data:', market);
      return { chainShortName: 'base', marketAddress: '' };
    }

    return market;
  };

  const query1 = useMarketGroup({
    chainShortName: getMarket(0).chainShortName,
    marketAddress: getMarket(0).marketAddress,
  });

  const query2 = useMarketGroup({
    chainShortName: getMarket(1).chainShortName,
    marketAddress: getMarket(1).marketAddress,
  });

  const query3 = useMarketGroup({
    chainShortName: getMarket(2).chainShortName,
    marketAddress: getMarket(2).marketAddress,
  });

  const query4 = useMarketGroup({
    chainShortName: getMarket(3).chainShortName,
    marketAddress: getMarket(3).marketAddress,
  });

  const query5 = useMarketGroup({
    chainShortName: getMarket(4).chainShortName,
    marketAddress: getMarket(4).marketAddress,
  });

  // Return results, filtering out unused slots
  const queries = [query1, query2, query3, query4, query5].slice(
    0,
    markets.length
  );

  // Log for debugging
  if (markets.length > 0) {
    console.log('Market queries debug:', {
      marketsLength: markets.length,
      markets: markets.map((m) => ({
        chainId: m.chainId,
        chainShortName: m.chainShortName,
        marketAddress: m.marketAddress?.slice(0, 10) + '...',
      })),
      queryResults: queries.map((q) => ({
        isLoading: q.isLoading,
        isError: q.isError,
        hasData: !!q.marketGroupData,
      })),
    });
  }

  return {
    queries,
    isAnyLoading: queries.some((q) => q.isLoading),
    hasAnyError: queries.some((q) => q.isError),
  };
}
