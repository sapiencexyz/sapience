import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { formatEther } from 'viem';

import { API_BASE_URL } from '~/lib/constants/constants';
import type { Market, Epoch } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96 } from '~/lib/util/util';

export function useSettlementPrice(market: Market, epoch: Epoch) {
  const [stEthPerToken, setStEthPerToken] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchStEthPerToken = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${market.chainId}&endTime=${epoch.endTimestamp}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch stEthPerToken');
        }
        const data = await response.json();
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
      const response = await fetch(
        `${API_BASE_URL}/prices/index/latest?contractId=${market.chainId}:${market.address}&epochId=${epoch.epochId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
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
