import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  NumberInput,
  NumberInputField,
  Text,
} from '@chakra-ui/react';
import type React from 'react';
import { useState, useEffect } from 'react';

interface SlippageToleranceProps {
  onSlippageChange: (slippage: number) => void;
}

const SlippageTolerance: React.FC<SlippageToleranceProps> = ({
  onSlippageChange,
}) => {
  const [slippage, setSlippage] = useState<number>(0.5);

  useEffect(() => {
    onSlippageChange(slippage);
  }, [slippage, onSlippageChange]);

  const handleSlippageChange = (
    valueAsString: string,
    valueAsNumber: number
  ) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value)) {
      setSlippage(valueAsNumber);
    }
  };

  return (
    <FormControl mb={2}>
      <HStack spacing={4} alignItems="center">
        <FormLabel mb={0}>Slippage Tolerance:</FormLabel>
        <Button
          onClick={() => setSlippage(0.1)}
          isActive={slippage === 0.1}
          size="xs"
        >
          0.1%
        </Button>
        <Button
          onClick={() => setSlippage(0.5)}
          isActive={slippage === 0.5}
          size="xs"
        >
          0.5%
        </Button>
        <Button
          onClick={() => setSlippage(1.0)}
          isActive={slippage === 1.0}
          size="xs"
        >
          1.0%
        </Button>
        <NumberInput
          size="xs"
          value={slippage}
          onChange={handleSlippageChange}
          min={0}
          max={100}
          step={0.1}
          precision={2}
        >
          <NumberInputField />
        </NumberInput>
      </HStack>
    </FormControl>
  );
};

export default SlippageTolerance;
