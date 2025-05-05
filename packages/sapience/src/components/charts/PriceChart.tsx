import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip'; // Assuming shared UI components
import { cn } from '@foil/ui/lib/utils'; // Assuming shared utils
import type { LineType } from '@foil/ui/types/charts';
import { TimeInterval } from '@foil/ui/types/charts'; // Assuming shared types
import { Loader2 } from 'lucide-react';
import { useRef, useEffect } from 'react';
import type React from 'react';

import { useLightweightChart } from '~/hooks/charts/useLightweightChart';
import { usePriceChartData } from '~/hooks/charts/usePriceChartData';

// Map TimeInterval enum to seconds for the hook
// Consider moving this map to a shared location if used elsewhere
const intervalToSecondsMap: Record<TimeInterval, number> = {
  [TimeInterval.I5M]: 300,
  [TimeInterval.I15M]: 900,
  [TimeInterval.I30M]: 1800,
  [TimeInterval.I4H]: 14400,
  [TimeInterval.I1D]: 86400,
};

interface PriceChartProps {
  market: {
    address: string;
    chainId: number;
    marketId: number; // Assuming numeric ID here, adjust if string
    quoteTokenName?: string; // Pass from parent if available
  };
  selectedInterval: TimeInterval;
  selectedPrices: Record<LineType, boolean>;
  resourceSlug?: string; // Add optional resourceSlug prop
  onHoverChange?: (
    data: { price: number | null; timestamp: number | null } | null
  ) => void; // Optional hover callback
}

const PriceChart: React.FC<PriceChartProps> = ({
  market,
  selectedInterval,
  selectedPrices,
  resourceSlug, // Destructure resourceSlug
  onHoverChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  console.log('[PriceChart] Props Received:', { market, selectedInterval, selectedPrices, resourceSlug }); // Log props

  // Fetch data using the data hook
  const { chartData, isLoading, isError, isFetching } = usePriceChartData({
    marketAddress: market.address,
    chainId: market.chainId,
    marketId: market.marketId.toString(), // Convert marketId to string for the hook
    interval: intervalToSecondsMap[selectedInterval],
    quoteTokenName: market.quoteTokenName,
    resourceSlug, // Pass resourceSlug to the hook
    // trailingAvgTimeSeconds: 604800, // Pass the 7-day average time (in seconds)
    // Add fromTimestamp/toTimestamp based on selectedWindow if needed in the future
  });

  console.log('[PriceChart] Data passed to useLightweightChart:', { chartData, selectedPrices }); // Log data for rendering hook

  // Render the chart using the rendering hook
  const { isLogarithmic, setIsLogarithmic, hoverData } = useLightweightChart({
    containerRef,
    priceData: chartData,
    selectedPrices,
  });

  // Propagate hover changes
  useEffect(() => {
    if (onHoverChange) {
      onHoverChange(hoverData);
    }
  }, [hoverData, onHoverChange]);

  // Handle loading and error states
  return (
    <div className="flex flex-col flex-1 relative group w-full h-full min-h-[300px]">
      {/* The chart container is always in the tree so the ref is set before the effect runs */}
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* Loading & error overlays */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/10 rounded-md z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-50" />
        </div>
      )}
      {/* Subtle fetching indicator */} 
      {isFetching && !isLoading && (
        <div className="absolute top-2 right-2 p-1 bg-background/80 rounded-full z-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground opacity-70" />
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 rounded-md z-10">
          <p className="text-destructive-foreground text-sm">
            Error loading chart data.
            {/* Optionally display error message: {error?.message} */}
          </p>
        </div>
      )}

      {/* Logarithmic Scale Toggle Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsLogarithmic(!isLogarithmic)}
              className={cn(
                'absolute bottom-1 right-1 w-8 h-6 rounded-sm bg-background border border-border text-muted-foreground flex items-center justify-center hover:bg-accent hover:border-accent transition-all duration-100 opacity-0 group-hover:opacity-100 z-10 text-xs font-mono',
                isLogarithmic &&
                  'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary/90'
              )}
              aria-label={
                isLogarithmic
                  ? 'Switch to linear scale'
                  : 'Switch to logarithmic scale'
              }
            >
              LOG
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end">
            <p>Toggle Logarithmic Scale</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default PriceChart;
