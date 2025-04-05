import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { cn } from '@foil/ui/lib/utils';
import { Loader2 } from 'lucide-react';
import { useRef, useContext, useMemo, useEffect, useState } from 'react';
import type React from 'react';

import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useChart } from '~/lib/hooks/useChart';
import type { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';

interface Props {
  resourceSlug?: string;
  market?: {
    epochId: number;
    chainId: number;
    address: string;
  };
  seriesVisibility?: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
  selectedWindow: TimeWindow | null;
  selectedInterval: TimeInterval;
  onHoverChange?: (
    data: { price: number | null; timestamp: number | null } | null
  ) => void;
}

const Chart: React.FC<Props> = ({
  resourceSlug,
  market,
  seriesVisibility,
  selectedWindow,
  selectedInterval,
  onHoverChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { useMarketUnits, startTime, endTime } = useContext(PeriodContext);
  const [isHovering, setIsHovering] = useState(false);

  const { isLogarithmic, setIsLogarithmic, loadingStates, hoverData } =
    useChart({
      resourceSlug,
      market,
      seriesVisibility,
      useMarketUnits,
      startTime,
      endTime,
      containerRef: chartContainerRef,
      selectedWindow,
      selectedInterval,
    });

  // Handle mouse enter/leave events
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const handleMouseEnter = () => {
      setIsHovering(true);
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      if (onHoverChange) {
        onHoverChange(null);
      }
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [onHoverChange]);

  // Pass hover data to parent when it changes
  useEffect(() => {
    if (onHoverChange && isHovering && hoverData) {
      onHoverChange(hoverData);
    }
  }, [hoverData, onHoverChange, isHovering]);

  // Reset hover data when not hovering
  useEffect(() => {
    if (!isHovering && onHoverChange) {
      onHoverChange(null);
    }
  }, [isHovering, onHoverChange]);

  const memoizedLoadingStates = useMemo(() => {
    return {
      ...loadingStates,
      any:
        loadingStates.candles ||
        loadingStates.index ||
        loadingStates.resource ||
        loadingStates.trailing,
    };
  }, [
    loadingStates.candles,
    loadingStates.index,
    loadingStates.resource,
    loadingStates.trailing,
  ]);

  return (
    <div className="flex flex-col flex-1 relative group w-full h-full">
      {memoizedLoadingStates.any && (
        <div className="absolute top-4 right-16 md:top-8 md:right-24 z-10">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground opacity-30" />
        </div>
      )}
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
                'absolute bottom-0 right-0 w-6 h-6 rounded-sm bg-background border border-border text-foreground flex items-center justify-center hover:bg-accent hover:border-accent transition-all duration-100 opacity-0 group-hover:opacity-100 z-5 text-xs',
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

export default Chart;
