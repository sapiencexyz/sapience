'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@sapience/ui/components/ui/tooltip';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';
import { Timer } from 'lucide-react';

interface EndTimeDisplayProps {
  endTime?: number | null;
}

const EndTimeDisplay: React.FC<EndTimeDisplayProps> = ({ endTime }) => {
  if (typeof endTime !== 'number') {
    // If endTime is not a number (e.g., null, undefined, or wrong type), show nothing.
    return null;
  }

  try {
    const date = fromUnixTime(endTime);
    const displayTime = formatDistanceToNow(date, { addSuffix: true });
    const isPast = date.getTime() <= Date.now();
    const label = isPast ? 'Ended' : 'Ends';
    const baseBadgeClasses = 'h-8 items-center px-3 text-xs leading-none';
    const outlineExtras = 'bg-background dark:bg-muted/50 border-border';
    const smallBadgeClassName =
      `${baseBadgeClasses} ${isPast ? '' : outlineExtras}`.trim();
    const largeBadgeClassName =
      `${baseBadgeClasses} inline-flex ${isPast ? '' : outlineExtras}`.trim();
    const fullLabel = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(date);
    return (
      <>
        {/* Small screens: compact with tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default md:hidden">
                <Badge
                  variant={isPast ? 'secondary' : 'outline'}
                  className={smallBadgeClassName}
                >
                  <Timer className="h-4 w-4 mr-1" />
                  {label} {displayTime}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fullLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* md+ screens: always show expanded inline content (no tooltip, no hover) */}
        <span className="hidden md:inline-flex cursor-default">
          <Badge
            variant={isPast ? 'secondary' : 'outline'}
            className={largeBadgeClassName}
          >
            <Timer className="h-3.5 w-3.5 mr-1 -mt-0.5 opacity-70" />
            {label} {displayTime}
            <span
              aria-hidden="true"
              className="hidden md:inline-block mx-2.5 h-4 w-px bg-muted-foreground/30"
            />
            <span className="whitespace-nowrap text-muted-foreground font-normal">
              {fullLabel}
            </span>
          </Badge>
        </span>
      </>
    );
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return null;
  }
};

export default EndTimeDisplay;
