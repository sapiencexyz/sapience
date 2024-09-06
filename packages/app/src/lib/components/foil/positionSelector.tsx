import {
  Box,
  FormControl,
  FormLabel,
  InputGroup,
  Select,
} from '@chakra-ui/react';
import { useContext, useMemo, type Dispatch, type SetStateAction } from 'react';
import type React from 'react';
import { useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface AccountSelectorProps {
  isLP: boolean;
  onChange: Dispatch<SetStateAction<number>>;
  nftIds: number[];
  value: number;
}

const useIsLps = (ids: number[]) => {
  const { foilData } = useContext(MarketContext);

  const tokensInfo = useReadContracts({
    contracts: ids.map((i) => {
      return {
        abi: foilData.abi,
        address: foilData.address as `0x${string}`,
        functionName: 'getPosition',
        args: [i],
      };
    }),
  });

  const isLps: boolean[] = useMemo(() => {
    if (!tokensInfo.data) return [];
    return tokensInfo.data.map((resp) => {
      const position = resp.result as FoilPosition;
      return position.kind === PositionKind.Liquidity;
    });
  }, [tokensInfo.data]);

  return isLps;
};

const AccountSelector: React.FC<AccountSelectorProps> = ({
  isLP,
  onChange,
  nftIds,
  value,
}) => {
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
        <FormLabel>Position</FormLabel>
        <Select onChange={handleAccountChange} value={value}>
          {filteredNfts.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
          <option key="new" value={0}>
            New Position
          </option>
        </Select>
      </FormControl>
    </Box>
  );
};

export default AccountSelector;
