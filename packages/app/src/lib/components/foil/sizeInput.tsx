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
  positionData?: FoilPosition;
  isLong?: boolean;
  error?: string;
  label?: string;
  defaultToGas?: boolean;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  positionData,
  isLong = true,
  error,
  label = 'Size',
  defaultToGas = true,
}) => {
  const [sizeInput, setSizeInput] = useState<string>('0');
  const [isGasInput, setIsGasInput] = useState(defaultToGas);

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeInput);
  }, [isLong]);

  const handleUpdateInputType = () => {
    const wasGasInput = isGasInput;
    setIsGasInput(!wasGasInput);

    if (sizeInput !== '') {
      const currentValue = parseFloat(sizeInput);
      const newValue = wasGasInput
        ? currentValue / 1e9 // Convert from gas to Ggas
        : currentValue * 1e9; // Convert from Ggas to gas

      // Format the new value to avoid scientific notation
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
      const newSize = processedVal === '' ? 0 : parseFloat(processedVal);
      const sizeInGas = isGasInput
        ? BigInt(Math.floor(newSize))
        : BigInt(Math.floor(newSize * 1e9));
      const sign = isLong ? BigInt(1) : BigInt(-1);
      setSize(sign * sizeInGas);
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
              {isGasInput ? 'gas' : 'Ggas'}
            </Button>
          </InputRightAddon>
        </InputGroup>
        {error && <FormErrorMessage>{error}</FormErrorMessage>}
      </FormControl>
    </Box>
  );
};

export default SizeInput;
