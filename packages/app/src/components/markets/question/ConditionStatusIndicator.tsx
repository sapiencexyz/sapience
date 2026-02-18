'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

interface ConditionStatusIndicatorProps {
  endTime?: number | null;
  settled?: boolean | null;
  resolvedToYes?: boolean | null;
}

function ResolutionBadge({ resolvedToYes }: { resolvedToYes: boolean }) {
  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
        resolvedToYes
          ? 'border-yes/40 bg-yes/10 text-yes'
          : 'border-no/40 bg-no/10 text-no'
      }`}
    >
      RESOLVED {resolvedToYes ? 'YES' : 'NO'}
    </Badge>
  );
}

export function ConditionStatusIndicator({
  endTime,
  settled,
  resolvedToYes,
}: ConditionStatusIndicatorProps) {
  const nowSec = Math.floor(Date.now() / 1000);
  const hasEnded = typeof endTime === 'number' ? endTime <= nowSec : false;

  const state: 'pending' | 'resolvedYes' | 'resolvedNo' | 'active' = (() => {
    if (!hasEnded) return 'active';
    if (!settled) return 'pending';
    return resolvedToYes ? 'resolvedYes' : 'resolvedNo';
  })();

  const isResolved = state === 'resolvedYes' || state === 'resolvedNo';

  const circle = (() => {
    const base =
      'relative inline-flex h-[18px] w-[18px] items-center justify-center';
    switch (state) {
      case 'pending':
        return (
          <span className={base}>
            <span className="absolute inset-0 rounded-full bg-foreground/20 animate-[pulse_3.6s_ease-in-out_infinite]" />
            <span className="relative h-[14px] w-[14px] rounded-full border border-foreground/40" />
          </span>
        );
      case 'resolvedYes':
        return (
          <span className={base}>
            <span className="relative h-[14px] w-[14px] rounded-full border border-yes/50 bg-yes/25" />
          </span>
        );
      case 'resolvedNo':
        return (
          <span className={base}>
            <span className="relative h-[14px] w-[14px] rounded-full border border-no/50 bg-no/25" />
          </span>
        );
      case 'active':
      default:
        return (
          <span className={base}>
            <span className="relative h-[14px] w-[14px] rounded-full border border-foreground/35 bg-foreground/10" />
          </span>
        );
    }
  })();

  const tooltipContent = (() => {
    if (!hasEnded) return 'Active';
    if (!settled) return 'Resolution Pending';
    return <ResolutionBadge resolvedToYes={!!resolvedToYes} />;
  })();

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{circle}</TooltipTrigger>
        <TooltipContent
          className={
            isResolved
              ? 'border-none bg-transparent shadow-none p-0'
              : undefined
          }
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
