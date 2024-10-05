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
  Text,
} from '@chakra-ui/react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId?: number;
  setSize: Dispatch<SetStateAction<bigint>>;
  positionData?: FoilPosition;
  originalPositionSize?: bigint;
  isLong?: boolean;
  error?: string;
  label?: string;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  positionData,
  originalPositionSize = 0,
  isLong = true,
  error,
  label = 'Size',
}) => {
  const [sizeInput, setSizeInput] = useState<string>('');
  const [isGasInput, setIsGasInput] = useState(true);

  const isEdit = nftId && nftId > 0;

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeInput);
  }, [isLong]);

  const handleUpdateInputType = () => setIsGasInput(!isGasInput);

  const handleSizeChange = (newVal: string) => {
    const numberPattern = isGasInput ? /^\d*$/ : /^(0|[1-9]\d*)(\.\d*)?$/;

    if (newVal === '' || numberPattern.test(newVal)) {
      setSizeInput(newVal);
      const newSize = newVal === '' ? 0 : parseFloat(newVal);
      const sizeInGgas = isGasInput
        ? BigInt(Math.floor(newSize * 1e9))
        : BigInt(Math.floor(newSize * 1e18));
      const sign = isLong ? BigInt(1) : BigInt(-1);
      setSize(BigInt(originalPositionSize) + sign * sizeInGgas);
    }
  };

  const displayedValue = isGasInput
    ? sizeInput
    : (Number(sizeInput) * 1e9).toFixed(9);

  return (
    <Box mb={4}>
      <FormControl mb={4} isInvalid={!!error}>
        <FormLabel>
          {label} {isEdit ? 'Change' : ''}
        </FormLabel>
        <InputGroup>
          <Input
            value={displayedValue}
            type="text"
            inputMode={isGasInput ? 'numeric' : 'decimal'}
            min={0}
            step={isGasInput ? '1' : 'any'}
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
      <Text fontSize="sm" color="gray.600">
        Equivalent:{' '}
        {isGasInput
          ? (Number(sizeInput) / 1e9).toFixed(9)
          : (Number(sizeInput) * 1e9).toFixed(0)}{' '}
        {isGasInput ? 'Ggas' : 'gas'}
      </Text>
    </Box>
  );
};

export default SizeInput;
