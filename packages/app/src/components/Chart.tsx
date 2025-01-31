import { useRef, useContext } from 'react';
import type React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useChart } from '~/lib/hooks/useChart';
import { cn } from '~/lib/utils';

interface Props {
  resourceSlug?: string;
  market?: {
    epochId?: number;
    chainId?: number;
    address?: string;
  };
  seriesVisibility?: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
}

export const GREEN_PRIMARY = '#22C55E';
export const RED = '#D85B4E';
export const GREEN = '#38A667';
export const BLUE = '#2E6FA8';
export const NEUTRAL = '#58585A';

const CandlestickChart: React.FC<Props> = ({
  resourceSlug,
  market,
  seriesVisibility,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { stEthPerToken, useMarketUnits, startTime } =
    useContext(PeriodContext);

  const { isLogarithmic, setIsLogarithmic } = useChart({
    resourceSlug,
    market,
    seriesVisibility,
    stEthPerToken: stEthPerToken ?? 1,
    useMarketUnits,
    startTime,
    containerRef: chartContainerRef,
  });

  return (
    <div className="flex flex-col flex-1 relative group w-full h-full">
      <div className="flex flex-1 h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsLogarithmic(!isLogarithmic)}
              className={cn(
                'absolute bottom-0 right-2 w-6 h-6 rounded-sm bg-background border border-border text-foreground flex items-center justify-center hover:bg-accent hover:border-accent transition-all duration-100 opacity-0 group-hover:opacity-100 z-5 text-xs',
                isLogarithmic &&
                  'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary/90'
              )}
            >
              L
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Toggle logarithmic scale</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default CandlestickChart;
