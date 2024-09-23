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

    const roundedValue = Number(numValue.toFixed(4));
    return roundedValue.toString().replace(/\.?0+$/, '');
  };

  const displayValue = formatNumber(value || 0);

  return <Tooltip label={value.toString()}>{displayValue}</Tooltip>;
};

export default NumberDisplay;
