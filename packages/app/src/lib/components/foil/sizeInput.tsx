'use client';

import { ArrowUpDownIcon } from '@chakra-ui/icons';
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
} from '@chakra-ui/react';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useEffect, useState } from 'react';

import { MarketContext } from '../../context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId: number;
  setSize: Dispatch<SetStateAction<number>>;
  positionData: FoilPosition;
  originalPositionSize: number;
  isLong: boolean;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  positionData,
  originalPositionSize,
  isLong,
}) => {
  const { collateralAssetTicker, pool } = useContext(MarketContext);
  const [collateralChange, setCollateralChange] = useState<number>(0);
  const [sizeChange, setSizeChange] = useState<number>(0);
  const [isGgasInput, setIsGgasInput] = useState(true);

  const refPrice = pool?.token0Price.toSignificant(3);
  const isEdit = nftId > 0;

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeChange.toString());
  }, [isLong]);

  const handleUpdateInputType = () => setIsGgasInput(!isGgasInput);

  /**
   * Update size and collateralChange based on the new size input
   * @param newVal - new value of the size input
   */
  const handleSizeChange = (newVal: string) => {
    if (!refPrice) return;
    const newSizeChange = parseFloat(newVal || '0');
    setSizeChange(newSizeChange);
    const sign = isLong ? 1 : -1;
    setSize(originalPositionSize + sign * newSizeChange);
    const newCollateral = parseFloat(`${newSizeChange / Number(refPrice)}`);
    setCollateralChange(newCollateral);
  };

  /**
   * Update size and collateralChange based on the new collateralChange input
   * @param newVal - new value of the collateralChange input
   */
  const handleCollateralChange = (newVal: string) => {
    if (!refPrice) return;
    const newCollateral = parseFloat(newVal || '0');
    setCollateralChange(newCollateral);
    const newSizeChange = parseFloat(`${newCollateral * Number(refPrice)}`);
    setSizeChange(newSizeChange);
    const sign = isLong ? 1 : -1;
    setSize(originalPositionSize + sign * newSizeChange);
  };

  return (
    <Box mb={4}>
      <FormControl mb={4}>
        <FormLabel>Size {isEdit ? 'Change' : ''}</FormLabel>
        <InputGroup>
          <Input
            borderRight="none"
            value={isGgasInput ? Number(sizeChange) : Number(collateralChange)}
            type="number"
            min={0}
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) =>
              isGgasInput
                ? handleSizeChange(e.target.value)
                : handleCollateralChange(e.target.value)
            }
          />
          <InputRightAddon bg="none">
            <Button
              px={3}
              h="1.75rem"
              size="sm"
              onClick={handleUpdateInputType}
              rightIcon={<ArrowUpDownIcon h={2.5} />}
            >
              {isGgasInput ? 'Ggas' : collateralAssetTicker}
            </Button>
          </InputRightAddon>
        </InputGroup>
      </FormControl>
      <FormControl>
        <InputGroup>
          <Input
            readOnly
            value={isGgasInput ? collateralChange : sizeChange}
            bg="blackAlpha.100"
            type="number"
          />
          <InputRightAddon>
            {isGgasInput ? collateralAssetTicker : 'Ggas'}
          </InputRightAddon>
        </InputGroup>
      </FormControl>
    </Box>
  );
};

export default SizeInput;
