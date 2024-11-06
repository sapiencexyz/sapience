import { Minus } from 'lucide-react';
import type React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type NumberDisplayProps = {
  value: number | string;
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
      return '<0.0001';
    }

    const roundedValue = Number(numValue.toFixed(4));

    return roundedValue.toString();
  };

  const displayValue = formatNumber(value || 0);

  return displayValue.length ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger type="button" className="cursor-default">
          {displayValue}
        </TooltipTrigger>
        <TooltipContent className="font-normal">
          {value.toString()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <Minus className="opacity-20" />
  );
};

export default NumberDisplay;
