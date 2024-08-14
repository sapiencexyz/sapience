import { times } from 'lodash';
import { useContext, useEffect, useMemo } from 'react';
import type { AbiFunction } from 'viem';
import { useReadContract, useReadContracts } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import { MarketContext } from '../context/MarketProvider';

export const useTokenIdsOfOwner = (ownerAddress: `0x${string}`) => {
  const { chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const {
    data: balanceData,
    refetch,
    isRefetching: isRefetchingBalance,
    isLoading: isLoadingBalance,
  } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  const tokenBalance = useMemo(() => {
    if (!balanceData) return 0;
    return parseInt(balanceData.toString(), 10);
  }, [balanceData]);

  const contracts = useMemo(() => {
    return times(tokenBalance).map((i) => {
      return {
        abi: foilData.abi as AbiFunction[],
        address: foilData.address as `0x${string}`,
        functionName: 'tokenOfOwnerByIndex',
        args: [ownerAddress, i],
      };
    });
  }, [tokenBalance]);

  const { data, isLoading: isLoadingContracts } = useReadContracts({
    contracts,
  });

  const tokenIds = useMemo(() => {
    if (data) {
      const ids = [];
      for (const t of data) {
        if (t.result) {
          ids.push(parseInt(t.result.toString(), 10));
        }
      }
      return ids;
    }
    return [];
  }, [data]);
  return {
    tokenIds,
    refetch,
    isLoadingContracts,
    isLoadingBalance,
    isRefetchingBalance,
  };
};
