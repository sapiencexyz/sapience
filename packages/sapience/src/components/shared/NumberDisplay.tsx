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
}

const NumberDisplay = ({ value, className }: NumberDisplayProps) => {
  const formattedValue = formatNumber(value);
  const originalValue = value.toString();

  if (formattedValue === originalValue) {
    return <span className={className}>{formattedValue}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{formattedValue}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{originalValue}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default NumberDisplay;
