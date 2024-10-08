import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
} from '@chakra-ui/react';
import type React from 'react';
import { useState, useEffect, useCallback } from 'react';

interface SlippageToleranceProps {
  onSlippageChange: (slippage: number) => void;
}

const SlippageTolerance: React.FC<SlippageToleranceProps> = ({
  onSlippageChange,
}) => {
  const [slippage, setSlippage] = useState<number>(0.5);

  const handleSlippageChange = useCallback(
    (valueString: string) => {
      const value = parseFloat(valueString);
      if (!isNaN(value)) {
        setSlippage(value);
        onSlippageChange(value);
      }
    },
    [onSlippageChange]
  );

  useEffect(() => {
    onSlippageChange(slippage);
  }, [slippage, onSlippageChange]);

  return (
    <FormControl mb={4}>
      <FormLabel>Slippage Tolerance</FormLabel>
      <HStack spacing={4} alignItems="center">
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
        <InputGroup size="xs" maxWidth="100px">
          <Input
            value={slippage}
            onChange={(e) => handleSlippageChange(e.target.value)}
            min={0}
            max={100}
            step={0.1}
            type="number"
          />
          <InputRightAddon>%</InputRightAddon>
        </InputGroup>
      </HStack>
    </FormControl>
  );
};

export default SlippageTolerance;
