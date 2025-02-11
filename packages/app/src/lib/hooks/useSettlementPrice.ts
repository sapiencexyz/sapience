import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { formatEther } from 'viem';

import type { Market, Epoch } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96, foilApi } from '~/lib/utils/util';

export function useSettlementPrice(market: Market, epoch: Epoch) {
  const [stEthPerToken, setStEthPerToken] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchStEthPerToken = async () => {
      setIsLoading(true);
      try {
        const data = await foilApi.get(
          `/getStEthPerTokenAtTimestamp?chainId=${market.chainId}&endTime=${epoch.endTimestamp}`
        );
        setStEthPerToken(Number(formatEther(BigInt(data.stEthPerToken))));
      } catch (error) {
        console.error('Error fetching stEthPerToken:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStEthPerToken();
  }, [market.chainId, epoch.endTimestamp]);

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: [
      'latestPrice',
      `${market?.chainId}:${market?.address}`,
      epoch.epochId,
    ],
    queryFn: async () => {
      const data = await foilApi.get(
        `/prices/index/latest?contractId=${market.chainId}:${market.address}&epochId=${epoch.epochId}`
      );
      return Number(gweiToEther(BigInt(data.price)));
    },
    enabled: epoch.epochId !== 0 || market !== undefined,
  });

  const priceAdjusted = (latestPrice ?? 0) / (stEthPerToken || 1);

  const sqrtPriceX96 = convertToSqrtPriceX96(priceAdjusted);

  return {
    latestPrice,
    stEthPerToken,
    priceAdjusted,
    sqrtPriceX96,
    isLoading: isLoading || isLatestPriceLoading,
  };
}
