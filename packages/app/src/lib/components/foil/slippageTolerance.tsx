import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  HStack,
  NumberInput,
  NumberInputField,
  Text,
} from '@chakra-ui/react';

interface SlippageToleranceProps {
  onSlippageChange: (slippage: number) => void;
}

const SlippageTolerance: React.FC<SlippageToleranceProps> = ({ onSlippageChange }) => {
  const [slippage, setSlippage] = useState<number>(0.5);

  useEffect(() => {
    onSlippageChange(slippage);
  }, [slippage, onSlippageChange]);

  const handleSlippageChange = (valueAsString: string, valueAsNumber: number) => {
    setSlippage(valueAsNumber);
  };

  const handleCustomSlippageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value)) {
      setSlippage(value);
    }
  };

  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Text fontSize="xl" mb={4}>Slippage Tolerance</Text>
      <HStack spacing={4}>
        <Button onClick={() => setSlippage(0.1)} isActive={slippage === 0.1}>0.1%</Button>
        <Button onClick={() => setSlippage(0.5)} isActive={slippage === 0.5}>0.5%</Button>
        <Button onClick={() => setSlippage(1.0)} isActive={slippage === 1.0}>1.0%</Button>
      </HStack>
      <Box mt={4}>
        <NumberInput
          value={slippage}
          onChange={handleSlippageChange}
          min={0}
          max={100}
          step={0.1}
          precision={2}
        >
          <NumberInputField />
        </NumberInput>
      </Box>
    </Box>
  );
};

export default SlippageTolerance;
