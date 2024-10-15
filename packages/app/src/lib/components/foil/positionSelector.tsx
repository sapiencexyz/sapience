import { FormControl, FormLabel, Select } from '@chakra-ui/react';
import { useEffect, useMemo } from 'react';
import type React from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';

interface PositionSelectorProps {
  isLP?: boolean | null;
}

const PositionSelector: React.FC<PositionSelectorProps> = ({ isLP }) => {
  const { nftId, setNftId, tokenIds, isLps } = useAddEditPosition();

  const filteredNfts = useMemo(
    () =>
      isLP === null
        ? tokenIds
        : tokenIds.filter((_, index) => (isLP ? isLps[index] : !isLps[index])),
    [tokenIds, isLps, isLP]
  );

  useEffect(() => {
    setNftId(filteredNfts[filteredNfts.length - 1] || 0);
  }, [filteredNfts, setNftId]);

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
  );
};

export default PositionSelector;
