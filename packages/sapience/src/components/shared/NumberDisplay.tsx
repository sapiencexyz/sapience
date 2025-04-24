import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';

import { formatNumber } from '~/lib/utils/util';

interface NumberDisplayProps {
  value: number;
  className?: string;
  appendedText?: string;
}

const NumberDisplay = ({
  value,
  className,
  appendedText,
}: NumberDisplayProps) => {
  const formattedValue = formatNumber(value);
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
