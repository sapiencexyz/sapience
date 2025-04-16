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
import { gql } from '@apollo/client';
import { print } from 'graphql';

interface ChartProps {
  slug: string;
  market: {
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

export const Chart = ({
  slug,
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

  // Query to get the chart data
  // const { data: chartData, isLoading: isChartLoading } = useQuery({
  //   queryKey: [
  //     'chart',
  //     market.chainId,
  //     market.address,
  //     market.epochId,
  //     selectedWindow,
  //     selectedInterval,
  //     slug,
  //   ],
  //   queryFn: async () => {
  //     if (!slug || !selectedWindow || !selectedInterval) {
  //       console.log('Missing required data:', { slug, selectedWindow, selectedInterval });
  //       return null;
  //     }

  //     const now = Math.floor(Date.now() / 1000);
  //     let from: number;
  //     let to: number = now;

  //     // Calculate from timestamp based on TimeWindow
  //     switch (selectedWindow) {
  //       case TimeWindow.D:
  //         from = now - 86400; // 1 day
  //         break;
  //       case TimeWindow.W:
  //         from = now - 604800; // 1 week
  //         break;
  //       case TimeWindow.M:
  //         from = now - 2592000; // 1 month
  //         break;
  //       default:
  //         from = now - 86400; // default to 1 day
  //     }

  //     // Convert TimeInterval to seconds
  //     let interval: number;
  //     switch (selectedInterval) {
  //       case TimeInterval.I5M:
  //         interval = 300;
  //         break;
  //       case TimeInterval.I15M:
  //         interval = 900;
  //         break;
  //       case TimeInterval.I30M:
  //         interval = 1800;
  //         break;
  //       case TimeInterval.I1H:
  //         interval = 3600;
  //         break;
  //       case TimeInterval.I4H:
  //         interval = 14400;
  //         break;
  //       case TimeInterval.I1D:
  //         interval = 86400;
  //         break;
  //       default:
  //         interval = 900; // default to 15 minutes
  //     }

  //     const query = gql`
  //       query ResourceCandles($slug: String!, $from: Int!, $to: Int!, $interval: Int!) {
  //         resourceCandles(slug: $slug, from: $from, to: $to, interval: $interval) {
  //           timestamp
  //           open
  //           high
  //           low
  //           close
  //         }
  //       }
  //     `;

  //     const response = await foilApi.post('/graphql', {
  //       query: print(query),
  //       variables: {
  //         slug,
  //         from,
  //         to,
  //         interval,
  //       },
  //     });

  //     return response.data.data.resourceCandles;
  //   },
  //   enabled: !!slug && !!selectedWindow && !!selectedInterval,
  //   retry: 3,
  //   retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // });

  // Show loading state while either query is loading
  // if (isChartLoading) {
  //   return (
  //     <div className="flex items-center justify-center w-full h-full">
  //       <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
  //     </div>
  //   );
  // }

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
