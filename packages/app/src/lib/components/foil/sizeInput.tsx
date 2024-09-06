'use client';

import {
  Box,
  FormControl,
  Text,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
} from '@chakra-ui/react';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { MarketContext } from '../../context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId: number;
  size: number;
  setSize: Dispatch<SetStateAction<number>>;
}

const SizeInput: React.FC<Props> = ({ nftId, size, setSize }) => {
  const { collateralAssetTicker, pool, foilData, collateralAssetDecimals } =
    useContext(MarketContext);
  const [collateral, setCollateral] = useState<number>(0);
  const [isGgasInput, setIsGgasInput] = useState(true);

  const refPrice = pool?.token0Price.toSignificant(3);
  const isEdit = nftId > 0;

  const { data: positionData } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  const originalCollateral = positionData
    ? formatUnits(
        positionData.depositedCollateralAmount,
        collateralAssetDecimals
      )
    : '0';

  const originalSize = useMemo(() => {
    if (!positionData) return '0';
    console.log('POSITION DATA = ', positionData);
    const _size =
      positionData.vGasAmount > BigInt(0)
        ? positionData.vGasAmount
        : positionData.borrowedVGas;
    return formatUnits(_size, collateralAssetDecimals);
  }, [positionData, collateralAssetDecimals]);

  const handleUpdateInputType = () => setIsGgasInput(!isGgasInput);

  /**
   * Update size and collateral based on the new size input
   * @param newVal - new value of the size input
   */
  const handleSizeChange = (newVal: string) => {
    console.log('ref price is', refPrice);
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
            >
              {isGgasInput ? 'Ggas' : collateralAssetTicker}
            </Button>
          </InputRightAddon>
        </InputGroup>
        <Text hidden={!isEdit} fontSize="small">
          Original value: {isGgasInput ? originalSize : originalCollateral}
        </Text>
      </FormControl>
      <FormControl mb={4}>
        <InputGroup>
          <Input
            readOnly
            value={isGgasInput ? collateral : size}
            type="number"
          />
          <InputRightAddon>
            {isGgasInput ? collateralAssetTicker : 'Ggas'}
          </InputRightAddon>
        </InputGroup>
        <Text hidden={!isEdit} fontSize="small">
          Original value: {!isGgasInput ? originalSize : originalCollateral}
        </Text>
      </FormControl>
    </Box>
  );
};

export default SizeInput;
