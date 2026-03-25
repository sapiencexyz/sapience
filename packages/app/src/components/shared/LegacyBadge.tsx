'use client';

import { HelpCircle } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

interface LegacyBadgeProps {
  className?: string;
}

export default function LegacyBadge({ className }: LegacyBadgeProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="inline-flex items-center">
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 pr-1 text-[10px] px-1.5 py-0 h-5 font-mono text-muted-foreground border-muted-foreground/40 ${className ?? ''}`}
        >
          <span>LEGACY</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label="Legacy position details"
                className="inline-flex items-center justify-center h-4 w-4 text-muted-foreground hover:text-foreground cursor-help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                This position was created on a previous version of the escrow
                contract. It can still be claimed or redeemed normally.
              </p>
            </TooltipContent>
          </Tooltip>
        </Badge>
      </div>
    </TooltipProvider>
  );
}
