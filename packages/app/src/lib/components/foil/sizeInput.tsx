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

  const getNextInputType = (
    currentType: 'gas' | 'Ggas' | 'collateral'
  ): 'gas' | 'Ggas' | 'collateral' => {
    if (allowCollateralInput) {
      const mapping = {
        gas: 'Ggas',
        Ggas: 'collateral',
        collateral: 'gas',
      } as const;
      return mapping[currentType];
    }
    return currentType === 'gas' ? 'Ggas' : 'gas';
  };

  const convertValue = (
    value: number,
    fromType: string,
    toType: string
  ): number => {
    if (fromType === 'gas' && toType === 'Ggas') return value / 1e9;
    if (fromType === 'Ggas' && toType === 'gas') return value * 1e9;
    return 0; // Reset value when switching to/from collateral
  };

  const handleUpdateInputType = () => {
    const newType = getNextInputType(inputType);
    setInputType(newType);

    if (sizeInput === '') return;

    const currentValue = parseFloat(sizeInput);
    const newValue = convertValue(currentValue, inputType, newType);
    const formattedValue = newValue.toLocaleString('fullwide', {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
    if (newValue === 0) {
      handleSizeChange('0');
    }
    setSizeInput(formattedValue);
  };

  const processCollateralInput = (value: string) => {
    const collateralAmount = value === '' ? 0 : parseFloat(value);
    onCollateralAmountChange?.(BigInt(Math.floor(collateralAmount * 1e18)));
  };

  const processSizeInput = (value: string) => {
    const newSize = value === '' ? 0 : parseFloat(value);
    const sizeInGas =
      inputType === 'gas'
        ? BigInt(Math.floor(newSize))
        : BigInt(Math.floor(newSize * 1e9));
    const sign = isLong ? BigInt(1) : BigInt(-1);
    setSize(sign * sizeInGas);
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
        processCollateralInput(processedVal);
      } else {
        processSizeInput(processedVal);
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
