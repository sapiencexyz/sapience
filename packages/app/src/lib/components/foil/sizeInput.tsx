'use client';

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
import { formatUnits } from 'viem';

import { MarketContext } from '../../context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { ArrowUpDownIcon } from '@chakra-ui/icons';

interface Props {
  nftId: number;
  size: number;
  setSize: Dispatch<SetStateAction<number>>;
  positionData: FoilPosition;
}

const SizeInput: React.FC<Props> = ({ nftId, size, setSize, positionData }) => {
  const { collateralAssetTicker, pool, collateralAssetDecimals } =
    useContext(MarketContext);
  const [collateral, setCollateral] = useState<number>(0);
  const [isGgasInput, setIsGgasInput] = useState(true);

  const refPrice = pool?.token0Price.toSignificant(3);
  const isEdit = nftId > 0;

  useEffect(() => {
    if (isEdit && positionData) {
      const _sizeBigInt =
        positionData.vGasAmount > BigInt(0)
          ? positionData.vGasAmount
          : positionData.borrowedVGas;
      const _size = parseFloat(
        formatUnits(_sizeBigInt, collateralAssetDecimals)
      );
      handleSizeChange(`${_size}`);
    } else {
      handleSizeChange('0');
    }
  }, [isEdit, positionData]);

  const handleUpdateInputType = () => setIsGgasInput(!isGgasInput);

  /**
   * Update size and collateral based on the new size input
   * @param newVal - new value of the size input
   */
  const handleSizeChange = (newVal: string) => {
    if (!refPrice) return;
    const newSize = parseFloat(newVal || '0');
    setSize(newSize);
    const newCollateral = parseFloat(`${newSize / Number(refPrice)}`);
    setCollateral(newCollateral);
  };

  /**
   * Update size and collateral based on the new collateral input
   * @param newVal - new value of the collateral input
   */
  const handleCollateralChange = (newVal: string) => {
    if (!refPrice) return;
    const newCollateral = parseFloat(newVal || '0');
    setCollateral(newCollateral);
    const newSize = parseFloat(`${newCollateral * Number(refPrice)}`);
    setSize(newSize);
  };

  return (
    <Box mb={4}>
      <FormControl mb={4}>
        <FormLabel>Size</FormLabel>
        <InputGroup>
          <Input
            borderRight="none"
            value={isGgasInput ? Number(size) : Number(collateral)}
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
            bg="blackAlpha.100"
            value={isGgasInput ? collateral : size}
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
