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
import { useContext, useState } from 'react';
import type { Control, Path, FieldValues } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';

import { MarketContext } from '~/lib/context/MarketProvider';
import { removeLeadingZeros } from '~/lib/util/util';

interface Props<T extends FieldValues> {
  label: string;
  name: Path<T>;
  control: Control<T>;
  isDisabled?: boolean;
  minAllowedPrice: number;
  maxAllowedPrice: number;
}

const LiquidityPriceInput = <T extends FieldValues>({
  label,
  name,
  control,
  isDisabled = false,
  minAllowedPrice,
  maxAllowedPrice,
}: Props<T>) => {
  const { collateralAssetTicker, stEthPerToken } = useContext(MarketContext);
  const [isGgasWstEth, setIsGgasWstEth] = useState(true);
  const currValue = useWatch({
    control,
    name,
  });
  const ggasWstEthToGasGwei = 1e9 / (stEthPerToken || 1);

  const handleToggleUnit = (
    value: string,
    onChange: (value: string) => void
  ) => {
    const newInputValue = isGgasWstEth
      ? (parseFloat(value) * ggasWstEthToGasGwei).toString()
      : (parseFloat(value) / ggasWstEthToGasGwei).toString();
    onChange(newInputValue);
    setIsGgasWstEth(!isGgasWstEth);
  };

  const getCurrentUnit = () => {
    return isGgasWstEth ? `Ggas/${collateralAssetTicker}` : 'gas/gwei';
  };

  const convertToCurrentUnit = (value: number) => {
    return isGgasWstEth ? value : value * ggasWstEthToGasGwei;
  };

  const getErrorMessage = (value: string) => {
    if (!value) return 'Price is required';
    const adjustedMinValue = convertToCurrentUnit(minAllowedPrice);
    const adjustMaxValue = convertToCurrentUnit(maxAllowedPrice);
    const outOfRangeMinError = currValue < adjustedMinValue;
    const outOfRangeMaxError = currValue > adjustMaxValue;
    if (outOfRangeMinError) {
      return `Price cannot be less than ${adjustedMinValue.toFixed(
        2
      )} ${getCurrentUnit()}`;
    }
    if (outOfRangeMaxError) {
      return `Price cannot exceed ${adjustMaxValue.toFixed(
        2
      )} ${getCurrentUnit()}`;
    }
    return '';
  };

  return (
    <Box mb={4}>
      <Controller
        name={name}
        control={control}
        rules={{
          required: 'Price is required',
          validate: (value) => {
            const errorMessage = getErrorMessage(value);
            return errorMessage || true;
          },
        }}
        render={({ field: { onChange, value, onBlur } }) => (
          <FormControl isInvalid={!!getErrorMessage(value)}>
            <FormLabel>{label}</FormLabel>
            <InputGroup>
              <Input
                value={value?.toString() || ''}
                onChange={(e) => onChange(removeLeadingZeros(e.target.value))}
                onBlur={() => {
                  if (value === '') {
                    onChange('0');
                  }
                  onBlur();
                }}
                type="number"
                inputMode="decimal"
                disabled={isDisabled}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <InputRightAddon bg="none" px={1}>
                <Button
                  px={3}
                  h="1.75rem"
                  size="sm"
                  onClick={() => handleToggleUnit(value, onChange)}
                  rightIcon={<ArrowUpDownIcon h={2.5} />}
                >
                  {getCurrentUnit()}
                </Button>
              </InputRightAddon>
            </InputGroup>
            <FormErrorMessage>{getErrorMessage(value)}</FormErrorMessage>
          </FormControl>
        )}
      />
    </Box>
  );
};

export default LiquidityPriceInput;
