import { FormControl, FormLabel, Select } from '@chakra-ui/react';
import { useMemo } from 'react';
import type React from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';

interface PositionSelectorProps {
  isLP?: boolean | null;
}

const PositionSelector: React.FC<PositionSelectorProps> = ({ isLP }) => {
  const { nftId, setNftId, positions } = useAddEditPosition();

  const filteredNfts = useMemo(
    () => (isLP ? positions.liquidityPositions : positions.tradePositions),
    [isLP, positions]
  );

  const handleAccountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedAccount = Number(event.target.value);
    setNftId(selectedAccount);
  };

  return (
    <FormControl mb={6} display="flex" alignItems="center">
      <FormLabel mb={0} mr={3} flexShrink={0}>
        Position
      </FormLabel>
      <Select
        borderRadius="md"
        onChange={handleAccountChange}
        value={nftId}
        size="sm"
      >
        {filteredNfts.map((nft) => (
          <option key={nft.id} value={Number(nft.id)}>
            {Number(nft.id)}
          </option>
        ))}
        {isLP !== null && (
          <option key="new" value={0}>
            New Position
          </option>
        )}
      </Select>
    </FormControl>
  );
};

export default PositionSelector;
