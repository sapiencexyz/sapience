'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import type * as React from 'react';

interface AwaitingSettlementBadgeProps {
  className?: string;
}

const AwaitingSettlementBadge: React.FC<AwaitingSettlementBadgeProps> = ({
  className,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className || ''}`.trim()}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-[260px]">
              Decentralized settlement typically takes hours, though it may take
              longer in certain cases.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        variant="outline"
        size="sm"
        disabled
        className="disabled:cursor-not-allowed"
      >
        Awaiting Settlement
      </Button>
    </span>
  );
};

export default AwaitingSettlementBadge;
