import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

import { formatNumber } from '~/lib/utils/util';

interface NumberDisplayProps {
  value: number;
  className?: string;
  appendedText?: string;
  decimals?: number;
}

const NumberDisplay = ({
  value,
  className,
  appendedText,
  decimals,
}: NumberDisplayProps) => {
  const precision = decimals ?? 2;
  const threshold = 1 / 10 ** precision;

  // Handle small non-zero values
  let formattedValue: string;
  if (value !== 0 && Math.abs(value) < threshold) {
    formattedValue =
      value > 0
        ? `<${threshold.toFixed(precision)}`
        : `>-${threshold.toFixed(precision)}`;
  } else {
    formattedValue = formatNumber(value, precision);
  }

  const originalValue = value.toString();
  const textToDisplay = appendedText ? ` ${appendedText}` : '';

  if (formattedValue === originalValue) {
    return (
      <span className={className}>
        {formattedValue}
        {textToDisplay}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>
            {formattedValue}
            {textToDisplay}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {originalValue}
            {textToDisplay}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default NumberDisplay;
