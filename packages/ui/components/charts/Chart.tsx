import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { foilApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { TimeInterval, TimeWindow } from '../../types/charts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

interface ChartProps {
  resourceSlug?: string;
  market: {
    marketId: number;
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

export const Chart = ({
  resourceSlug,
  market,
  seriesVisibility = {
    candles: true,
    index: true,
    resource: true,
    trailing: true,
  },
  selectedWindow,
  selectedInterval,
  onHoverChange,
}: ChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isLogarithmic, setIsLogarithmic] = useState(false);

  const { data: chartData, isLoading } = useQuery({
    queryKey: [
      'chart',
      market.chainId,
      market.address,
      market.marketId,
      selectedWindow,
      selectedInterval,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        chainId: market.chainId.toString(),
        address: market.address,
        marketId: market.marketId.toString(),
        window: selectedWindow || '',
        interval: selectedInterval,
      });
      return foilApi.get(`/charts/${resourceSlug}?${params.toString()}`);
    },
    enabled: !!resourceSlug && !!selectedWindow && !!selectedInterval,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 relative group w-full h-full">
      {isLoading && (
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
