'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@sapience/ui/components/ui/tooltip';
import { formatDistanceToNow, fromUnixTime, differenceInDays } from 'date-fns';
import { Timer } from 'lucide-react';

interface EndTimeDisplayProps {
  endTime?: number | null;
  settled?: boolean | null;
  size?: 'normal' | 'large';
  appearance?: 'default' | 'brandWhite';
}

const EndTimeDisplay: React.FC<EndTimeDisplayProps> = ({
  endTime,
  settled,
  size = 'normal',
  appearance = 'default',
}) => {
  if (typeof endTime !== 'number') {
    // If endTime is not a number (e.g., null, undefined, or wrong type), show nothing.
    return null;
  }

  try {
    const date = fromUnixTime(endTime);
    const now = new Date();
    const isPast = date.getTime() <= now.getTime();

    let badgeText: string;
    let showExpandedDate: boolean;

    if (!isPast) {
      badgeText = `Ends ${formatDistanceToNow(date, { addSuffix: true })}`;
      showExpandedDate = true;
    } else if (!settled) {
      badgeText = 'Ends soon';
      showExpandedDate = false;
    } else if (Math.abs(differenceInDays(date, now)) < 7) {
      badgeText = `Ended ${formatDistanceToNow(date, { addSuffix: true })}`;
      showExpandedDate = false;
    } else {
      const shortDate = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
      badgeText = `Ended ${shortDate}`;
      showExpandedDate = false;
    }

    const baseBadgeClasses =
      'h-9 items-center px-3.5 text-sm leading-none font-medium';
    const outlineExtras = 'bg-card border-border';
    const smallBadgeClassName =
      `${baseBadgeClasses} ${isPast ? '' : outlineExtras}`.trim();
    // Desktop (md+) sizing, adjustable via size prop
    const isLargeDesktop = size === 'large';
    const desktopBaseBadgeClasses = isLargeDesktop
      ? 'h-9 items-center px-3.5 text-sm leading-none font-medium'
      : baseBadgeClasses;
    const largeBadgeClassName =
      `${desktopBaseBadgeClasses} inline-flex ${isPast ? '' : outlineExtras}`.trim();
    const brandWhiteBadgeExtras =
      appearance === 'brandWhite'
        ? 'text-brand-white border-brand-white/20'
        : '';
    const timerColorClass =
      appearance === 'brandWhite' ? 'text-brand-white' : '';

    // Full label for tooltip
    const fullLabel = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(date);

    // Expanded date for desktop (only for future events)
    const expandedDate = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
                  className={`${smallBadgeClassName} ${brandWhiteBadgeExtras}`}
                >
                  <Timer
                    className={`h-4 w-4 mr-1.5 -mt-[1px] opacity-70 ${timerColorClass}`}
                  />
                  {badgeText}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fullLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* md+ screens: show with tooltip for details */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="hidden md:inline-flex cursor-default">
                <Badge
                  variant={isPast ? 'secondary' : 'outline'}
                  className={`${largeBadgeClassName} ${brandWhiteBadgeExtras}`}
                >
                  <Timer
                    className={`${isLargeDesktop ? 'h-4 w-4' : 'h-3.5 w-3.5'} mr-1.5 -mt-[1px] opacity-70 ${timerColorClass}`}
                  />
                  {badgeText}
                  {showExpandedDate && (
                    <>
                      <span
                        aria-hidden="true"
                        className="mx-2.5 h-4 w-px bg-muted-foreground/30"
                      />
                      <span className="whitespace-nowrap text-muted-foreground font-normal">
                        {expandedDate}
                      </span>
                    </>
                  )}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fullLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    );
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return null;
  }
};

export default EndTimeDisplay;
