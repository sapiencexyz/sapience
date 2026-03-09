'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { format } from 'date-fns';
import { formatCountdown } from '~/lib/utils/formatCountdown';
import { useSecondTick } from '~/hooks/useSecondTick';

/**
 * Live countdown to an end time, with a tooltip showing the full date.
 * Manages its own per-second tick internally.
 *
 * @param endTime  Unix timestamp in **seconds**
 */
export default function CountdownCell({ endTime }: { endTime: number }) {
  const nowMs = useSecondTick();

  const endMs = endTime * 1000;
  const date = new Date(endMs);
  const fullDateTime = format(date, "MMMM d, yyyy 'at' h:mm:ss a zzz");

  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const diff = endMs - nowMs;
  const isPast = diff <= 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`whitespace-nowrap tabular-nums cursor-default ${isPast ? 'text-muted-foreground' : 'font-mono text-brand-white'}`}
          >
            {formatCountdown(diff)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span>{fullDateTime}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
