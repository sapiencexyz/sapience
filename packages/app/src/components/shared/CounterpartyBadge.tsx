'use client';

import { HelpCircle } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

interface CounterpartyBadgeProps {
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
  tooltip?: string;
}

export default function CounterpartyBadge({
  className,
  labelClassName,
  iconClassName,
  tooltip = 'As the counterparty, this user needs only one of these predictions to be correct.',
}: CounterpartyBadgeProps) {
  return (
    <TooltipProvider>
      <div className="inline-flex items-center">
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 pr-1 ${className ?? ''}`}
        >
          <span className={`text-brand-white ${labelClassName ?? ''}`}>
            Counterparty
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Counterparty details"
                className={`inline-flex items-center justify-center h-4 w-4 text-muted-foreground hover:text-foreground ${iconClassName ?? ''}`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </Badge>
      </div>
    </TooltipProvider>
  );
}
