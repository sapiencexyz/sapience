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
  FormErrorMessage,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { Dispatch, SetStateAction, useContext } from 'react';
import { useEffect, useState } from 'react';
import { MarketContext } from '~/lib/context/MarketProvider';

import type { FoilPosition } from '~/lib/interfaces/interfaces';

type InputType = 'gas' | 'Ggas' | 'wstETH';

interface Props {
  nftId?: number;
  setSize: Dispatch<SetStateAction<bigint>>;
  size?: bigint;
  positionData?: FoilPosition;
  isLong?: boolean;
  error?: string;
  label?: string;
  defaultToGas?: boolean;
  currentPrice?: number;
  slippage?: number;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  size = BigInt(0),
  positionData,
  isLong = true,
  error,
  label = 'Size',
  defaultToGas = true,
  currentPrice = 0,
  slippage = 0.5,
}) => {
  const { collateralAssetTicker } = useContext(MarketContext);
  const [sizeInput, setSizeInput] = useState<string>('0');
  const [inputType, setInputType] = useState<InputType>(defaultToGas ? 'gas' : 'Ggas');

  const calculateSizeFromCollateral = (collateralAmount: number): bigint => {
    if (!currentPrice || currentPrice === 0) return BigInt(0);
    
    const MARGIN_REQUIREMENT = 0.1;
    
    // Adjust price for slippage
    const adjustedPrice = isLong 
      ? currentPrice * (1 + slippage / 100) // Higher price for longs
      : currentPrice * (1 - slippage / 100); // Lower price for shorts
    
    // Size = Collateral / (AdjustedPrice * Margin Requirement)
    const estimatedSize = collateralAmount / (adjustedPrice * MARGIN_REQUIREMENT);
    
    // Convert to gas units
    return BigInt(Math.floor(estimatedSize * 1e9));
  };

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeInput);
  }, [isLong]);

  useEffect(() => {
    if (size === BigInt(0)) {
      setSizeInput('0');
      return;
    }

    const absoluteSize = size < 0 ? -size : size;
    const numberValue = inputType === 'gas'
      ? absoluteSize.toString()
      : (Number(absoluteSize) / 1e9).toString();

    setSizeInput(numberValue);
  }, [size, inputType]);

  const handleSizeChange = (newVal: string) => {
    const numberPattern = /^(0|[1-9]\d*)(\.\d*)?$/;

    let processedVal = newVal;
    if (sizeInput === '0' && newVal !== '0' && newVal !== '0.') {
      processedVal = newVal.replace(/^0+/, '');
    }

    if (processedVal === '' || numberPattern.test(processedVal)) {
      setSizeInput(processedVal);
      const newSize = processedVal === '' ? 0 : parseFloat(processedVal);
      const sizeInGas = inputType === 'gas'
        ? BigInt(Math.floor(newSize))
        : BigInt(Math.floor(newSize * 1e9));
      const sign = isLong ? BigInt(1) : BigInt(-1);
      setSize(sign * sizeInGas);
    }
  };

  const handleInputTypeChange = (type: InputType) => {
    setInputType(type);
  };

  return (
    <Box mb={4}>
      <FormControl mb={4} isInvalid={!!error}>
        <FormLabel>
          {label} {nftId && nftId > 0 ? 'Change' : ''}
        </FormLabel>
        <InputGroup>
          <Input
            value={sizeInput}
            type="text"
            inputMode="decimal"
            min={0}
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => handleSizeChange(e.target.value)}
            borderRight="none"
          />
          <InputRightAddon bg="none" px={1}>
            <Menu>
              <MenuButton
                as={Button}
                px={3}
                h="1.75rem"
                size="sm"
                rightIcon={<ArrowUpDownIcon h={2.5} />}
              >
                {inputType === 'wstETH' ? collateralAssetTicker : inputType}
              </MenuButton>
              <MenuList>
                <MenuItem onClick={() => handleInputTypeChange('gas')}>gas</MenuItem>
                <MenuItem onClick={() => handleInputTypeChange('Ggas')}>Ggas</MenuItem>
                <MenuItem onClick={() => handleInputTypeChange('wstETH')}>{collateralAssetTicker}</MenuItem>
              </MenuList>
            </Menu>
          </InputRightAddon>
        </InputGroup>
        {error && <FormErrorMessage>{error}</FormErrorMessage>}
      </FormControl>
    </Box>
  );
};

export default SizeInput;
