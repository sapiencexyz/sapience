import {
  Box,
  FormControl,
  FormLabel,
  InputGroup,
  Select,
} from '@chakra-ui/react';
import { times } from 'lodash';
import { useContext, useMemo, type Dispatch, type SetStateAction } from 'react';
import type React from 'react';
import type { AbiFunction } from 'viem';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

import useFoilDeployment from './useFoilDeployment';
import { MarketContext } from '~/lib/context/MarketProvider';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface AccountSelectorProps {
  isLP: boolean;
  onChange: Dispatch<SetStateAction<number>>;
}

const useTokenIdsOfOwner = (ownerAddress: `0x${string}`) => {
  const { chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const balanceResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  const tokenBalance = useMemo(() => {
    if (!balanceResult.data) return 0;
    return parseInt(balanceResult.data.toString(), 10);
  }, [balanceResult]);

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
  return tokenIds;
};

const useIsLps = (ids: number[]) => {
  const { chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const tokensInfo = useReadContracts({
    contracts: ids.map((i) => {
      return {
        abi: foilData.abi as AbiFunction[],
        address: foilData.address as `0x${string}`,
        functionName: 'getPosition',
        args: [i],
      };
    }),
  });

  const isLps: boolean[] = useMemo(() => {
    if (!tokensInfo.data) return [];
    return tokensInfo.data.map((resp) => {
      return true; // uncomment below when contrract is updated
      //return  resp.positionKind === PositionKind.Liquidity
    });
  }, [tokensInfo.data]);

  return isLps;
};

const AccountSelector: React.FC<AccountSelectorProps> = ({
  isLP,
  onChange,
}) => {
  const { address } = useAccount();
  const nftIds = useTokenIdsOfOwner(address as `0x${string}`);
  const isLps = useIsLps(nftIds);
  const filteredNfts = nftIds.filter((_, index) =>
    isLP ? isLps[index] : !isLps[index]
  );

  const handleAccountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedAccount = Number(event.target.value);
    onChange(selectedAccount);
  };

  return (
    <Box>
      <FormControl mb={6}>
        <InputGroup gap={3} alignItems="center">
          <FormLabel color="gray.700" mb={0}>
            Position
          </FormLabel>
          <Select onChange={handleAccountChange}>
            {filteredNfts.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
            <option key="new" value={0}>
              New Position
            </option>
          </Select>
        </InputGroup>
      </FormControl>
    </Box>
  );
};

export default AccountSelector;
