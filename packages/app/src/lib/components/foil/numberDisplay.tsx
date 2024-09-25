import { MinusIcon } from '@chakra-ui/icons';
import { Tooltip } from '@chakra-ui/react';
import type React from 'react';

type NumberDisplayProps = {
  value: bigint | number | string;
};

const NumberDisplay: React.FC<NumberDisplayProps> = ({ value }) => {
  const formatNumber = (val: bigint | number | string): string => {
    let numValue: number;
    let stringValue: string;

    if (typeof val === 'bigint') {
      numValue = Number(val) / 10 ** 18;
      stringValue = val.toString();
    } else if (typeof val === 'number') {
      numValue = val;
      stringValue = val.toString();
    } else if (typeof val === 'string') {
      numValue = parseFloat(val);
      stringValue = val;
    } else {
      return 'Invalid input';
    }

    if (isNaN(numValue)) {
      return 'Invalid number';
    }

    if (Math.abs(numValue) < 0.0001 && numValue !== 0) {
      return '0.0000';
    }

    const roundedValue = Number(numValue.toFixed(4));
    return roundedValue.toString().replace(/\.?0+$/, '');
  };

  const displayValue = formatNumber(value || 0);

  return displayValue.length ? (
    <Tooltip label={value.toString()}>{displayValue}</Tooltip>
  ) : (
    <MinusIcon opacity={0.2} />
  );
};

export default NumberDisplay;
