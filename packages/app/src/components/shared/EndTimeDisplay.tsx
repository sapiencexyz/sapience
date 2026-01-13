'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@sapience/ui/components/ui/tooltip';
import {
  formatDistanceToNow,
  fromUnixTime,
  differenceInDays,
  differenceInHours,
} from 'date-fns';
import { Timer } from 'lucide-react';

interface EndTimeDisplayProps {
  endTime?: number | null;
  size?: 'normal' | 'large';
  appearance?: 'default' | 'brandWhite';
}

const EndTimeDisplay: React.FC<EndTimeDisplayProps> = ({
  endTime,
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

    // Calculate time differences for smarter display
    const daysDiff = Math.abs(differenceInDays(date, now));
    const hoursDiff = Math.abs(differenceInHours(date, now));

    // Smart display logic:
    // - Future: "Closes in X" with full date
    // - Past < 1 day: "Closed X hours ago"
    // - Past < 7 days: "Closed X days ago"
    // - Past >= 7 days: "Closed [short date]"
    let badgeText: string;
    let showExpandedDate: boolean;

    if (!isPast) {
      // Future: show relative time
      badgeText = `Resolves ${formatDistanceToNow(date, { addSuffix: true })}`;
      showExpandedDate = true;
    } else if (hoursDiff < 24) {
      // Ended recently (within 24 hours): show relative time only
      badgeText = `Ended ${formatDistanceToNow(date, { addSuffix: true })}`;
      showExpandedDate = false;
    } else if (daysDiff < 7) {
      // Ended within a week: show relative time only
      badgeText = `Ended ${formatDistanceToNow(date, { addSuffix: true })}`;
      showExpandedDate = false;
    } else {
      // Ended more than a week ago: show short date format
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
