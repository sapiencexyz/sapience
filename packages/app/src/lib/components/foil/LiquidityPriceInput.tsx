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
import { useContext, useEffect, useState } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  isDisabled?: boolean;
  error?: string;
  minAllowedPrice?: number;
  maxAllowedPrice?: number;
}

const LiquidityPriceInput: React.FC<Props> = ({
  label,
  value,
  onChange,
  isDisabled = false,
  error,
  minAllowedPrice,
  maxAllowedPrice,
}) => {
  const { collateralAssetTicker, stEthPerToken } = useContext(MarketContext);
  const [isGgasWstEth, setIsGgasWstEth] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(
      isGgasWstEth
        ? value.toString()
        : ((value * 1e9) / (stEthPerToken || 1)).toString()
    );
  }, [value, isGgasWstEth, stEthPerToken]);

  const handleToggleUnit = () => {
    setIsGgasWstEth(!isGgasWstEth);
    const newInputValue = isGgasWstEth
      ? ((parseFloat(inputValue) * 1e9) / (stEthPerToken || 1)).toString()
      : ((parseFloat(inputValue) / 1e9) * (stEthPerToken || 1)).toString();
    setInputValue(newInputValue);
  };

  const handleInputChange = (newVal: string) => {
    const numberPattern = /^(0|[1-9]\d*)(\.\d*)?$/;

    if (newVal === '' || numberPattern.test(newVal)) {
      setInputValue(newVal);
      const newValue = newVal === '' ? 0 : parseFloat(newVal);
      const ggasWstEthValue = isGgasWstEth
        ? newValue
        : (newValue / 1e9) * (stEthPerToken || 1);
      onChange(ggasWstEthValue);
    }
  };

  const getErrorMessage = () => {
    if (error) return error;
    if (minAllowedPrice && value < minAllowedPrice) {
      return `Price cannot be less than ${minAllowedPrice.toFixed(
        2
      )} Ggas/${collateralAssetTicker}`;
    }
    if (maxAllowedPrice && value > maxAllowedPrice) {
      return `Price cannot exceed ${maxAllowedPrice.toFixed(
        2
      )} Ggas/${collateralAssetTicker}`;
    }
    return '';
  };

  return (
    <Box mb={4}>
      <FormControl isInvalid={!!getErrorMessage()}>
        <FormLabel>{label}</FormLabel>
        <InputGroup>
          <Input
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            type="number"
            step="any"
            disabled={isDisabled}
            onWheel={(e) => e.currentTarget.blur()}
          />
          <InputRightAddon bg="none" px={1}>
            <Button
              px={3}
              h="1.75rem"
              size="sm"
              onClick={handleToggleUnit}
              rightIcon={<ArrowUpDownIcon h={2.5} />}
            >
              {isGgasWstEth ? `Ggas/${collateralAssetTicker}` : `gas/gwei`}
            </Button>
          </InputRightAddon>
        </InputGroup>
        <FormErrorMessage>{getErrorMessage()}</FormErrorMessage>
      </FormControl>
    </Box>
  );
};

export default LiquidityPriceInput;
