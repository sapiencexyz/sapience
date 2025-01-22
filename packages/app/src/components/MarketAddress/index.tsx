import { useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { shortenAddress } from '~/lib/util/util';
import { cn } from '~/lib/utils';

interface Props {
  address: string;
  showFull?: boolean;
}
const COPY_TO_CLIPBOARD = 'copy to clipboard';

const MarketAddress = ({ address, showFull }: Props) => {
  const [tooltipText, setTooltipText] = useState('');

  const handleCopy = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(address);
    setTooltipText('copied!');
    setTimeout(() => {
      setTooltipText('');
    }, 2000);
  };

  return (
    <TooltipProvider>
      <Tooltip open={!!tooltipText}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'inline-block cursor-pointer',
              'text-sm text-foreground'
            )}
            onMouseOverCapture={() => setTooltipText(COPY_TO_CLIPBOARD)}
            onMouseEnter={() => setTooltipText(COPY_TO_CLIPBOARD)}
            onMouseLeave={() => {
              if (tooltipText === COPY_TO_CLIPBOARD) {
                setTooltipText('');
              }
            }}
          >
            {showFull ? address : shortenAddress(address)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MarketAddress;
