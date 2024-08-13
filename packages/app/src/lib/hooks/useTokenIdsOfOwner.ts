import { MarketContext } from '../context/MarketProvider';
import useFoilDeployment from '../components/foil/useFoilDeployment';
import { useReadContract, useReadContracts } from 'wagmi';
import { useContext, useEffect, useMemo } from 'react';
import { times } from 'lodash';
import type { AbiFunction } from 'viem';

export const useTokenIdsOfOwner = (ownerAddress: `0x${string}`) => {
  const { chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const { data, refetch, isRefetching } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  const tokenBalance = useMemo(() => {
    if (!data) return 0;
    return parseInt(data.toString(), 10);
  }, [data]);

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

  const tokens = useReadContracts({
    contracts: contracts,
  });

  const tokenIds = useMemo(() => {
    if (tokens.data) {
      const ids = [];
      for (const t of tokens.data) {
        if (t.result) {
          ids.push(parseInt(t.result.toString(), 10));
        }
      }
      return ids;
    }
    return [];
  }, [tokens]);
  return { tokenIds, refetch };
};
