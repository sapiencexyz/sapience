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
} from '@chakra-ui/react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId?: number;
  setSize: Dispatch<SetStateAction<bigint>>;
  size?: bigint;
  positionData?: FoilPosition;
  isLong?: boolean;
  error?: string;
  label?: string;
  defaultToGas?: boolean;
  allowCollateralInput?: boolean;
  collateralAssetTicker?: string;
  onCollateralAmountChange?: (amount: bigint) => void;
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
  allowCollateralInput = false,
  collateralAssetTicker = '',
  onCollateralAmountChange,
}) => {
  const [sizeInput, setSizeInput] = useState<string>('0');
  const [isGasInput, setIsGasInput] = useState(defaultToGas);
  const [inputType, setInputType] = useState<'gas' | 'Ggas' | 'collateral'>(
    defaultToGas ? 'gas' : 'Ggas'
  );

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
    const numberValue = isGasInput
      ? absoluteSize.toString()
      : (Number(absoluteSize) / 1e9).toString();

    setSizeInput(numberValue);
  }, [size, isGasInput]);

  const handleUpdateInputType = () => {
    const currentType = inputType;
    let newType: 'gas' | 'Ggas' | 'collateral';
    
    if (allowCollateralInput) {
      // Cycle through all three types
      if (currentType === 'gas') newType = 'Ggas';
      else if (currentType === 'Ggas') newType = 'collateral';
      else newType = 'gas';
    } else {
      // Just toggle between gas and Ggas
      newType = currentType === 'gas' ? 'Ggas' : 'gas';
    }
    
    setInputType(newType);

    if (sizeInput !== '') {
      const currentValue = parseFloat(sizeInput);
      let newValue: number;
      
      // Convert based on type change
      if (currentType === 'gas' && newType === 'Ggas') {
        newValue = currentValue / 1e9;
      } else if (currentType === 'Ggas' && newType === 'gas') {
        newValue = currentValue * 1e9;
      } else if (newType === 'collateral') {
        // Reset input when switching to collateral
        newValue = 0;
      } else {
        // Reset input when switching from collateral
        newValue = 0;
      }

      const formattedValue = newValue.toLocaleString('fullwide', {
        useGrouping: false,
        maximumFractionDigits: 20,
      });
      setSizeInput(formattedValue);
    }
  };

  const handleSizeChange = (newVal: string) => {
    const numberPattern = /^(0|[1-9]\d*)(\.\d*)?$/;

    let processedVal = newVal;
    if (sizeInput === '0' && newVal !== '0' && newVal !== '0.') {
      processedVal = newVal.replace(/^0+/, '');
    }

    if (processedVal === '' || numberPattern.test(processedVal)) {
      setSizeInput(processedVal);
      
      if (inputType === 'collateral') {
        const collateralAmount = processedVal === '' ? 0 : parseFloat(processedVal);
        onCollateralAmountChange?.(BigInt(Math.floor(collateralAmount * 1e18)));
      } else {
        const newSize = processedVal === '' ? 0 : parseFloat(processedVal);
        const sizeInGas = inputType === 'gas'
          ? BigInt(Math.floor(newSize))
          : BigInt(Math.floor(newSize * 1e9));
        const sign = isLong ? BigInt(1) : BigInt(-1);
        setSize(sign * sizeInGas);
      }
    }
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
            <Button
              px={3}
              h="1.75rem"
              size="sm"
              onClick={handleUpdateInputType}
              rightIcon={<ArrowUpDownIcon h={2.5} />}
            >
              {inputType === 'collateral' ? collateralAssetTicker : inputType}
            </Button>
          </InputRightAddon>
        </InputGroup>
        {error && <FormErrorMessage>{error}</FormErrorMessage>}
      </FormControl>
    </Box>
  );
};

export default SizeInput;
