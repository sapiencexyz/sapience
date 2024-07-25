import {
  Box,
  FormControl,
  FormLabel,
  InputGroup,
  Select,
} from '@chakra-ui/react';
import { times } from 'lodash';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type React from 'react';
import type { AbiFunction } from 'viem';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

import Foil from '../../../../deployments/Foil.json';

interface AccountSelectorProps {
  isLP: boolean;
  onChange: Dispatch<SetStateAction<number>>;
}

const useTokenIdsOfOwner = (ownerAddress: `0x${string}`) => {
  const balanceResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  const [tokenIds, setTokenIds] = useState<number[]>([]);

  useEffect(() => {
    if (balanceResult.data) {
      const balance = parseInt(balanceResult.data.toString(), 10);
      const tokenContracts = times(balance, (index) => ({
        abi: Foil.abi as AbiFunction[],
        address: Foil.address as `0x${string}`,
        functionName: 'tokenOfOwnerByIndex',
        args: [ownerAddress, index],
      }));
      /*
      const fetchTokenIds = async () => {
        const tokensInfo = await useReadContracts({
          contracts: tokenContracts,
        });

        if (tokensInfo.data?.length) {
          // Extract token IDs from the responses
          const ids = tokensInfo.data.map((resp) =>
            parseInt(resp.data.toString(), 10)
          );
          setTokenIds(ids);
        }
      };

      fetchTokenIds();
      */
    }
  }, [balanceResult.data, ownerAddress]); // React to changes in the balance result

  return tokenIds;
};

const useIsLps = (ids: number[]) => {
  const [isLps, setIsLps] = useState<boolean[]>([]);
  /*
  useEffect(() => {
    const fetchIsLps = async () => {
      const tokenContracts = ids.map((id) => ({
        abi: Foil.abi as AbiFunction[],
        address: Foil.address as `0x${string}`,
        functionName: 'getPosition',
        args: [id],
      }));

      const tokensInfo = await useReadContracts({
        contracts: tokenContracts,
      });

      const newIsLps = [] as any[]; // tokensInfo.data?.map((resp) => resp?.isLp);
      setIsLps(newIsLps);
    };

    fetchIsLps();
  }, [ids]); // React to changes in the balance result
*/
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
