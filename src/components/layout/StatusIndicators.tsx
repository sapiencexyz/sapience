'use client';

import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useRpcPing } from '~/hooks/blockchain/useRpcPing';

export function StatusIndicators() {
  const pingMs = useRpcPing();
  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-1.5 text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums cursor-default">
            <Image
              src="/robinhood-logomark.svg"
              alt="Robinhood"
              width={14}
              height={14}
              className="opacity-70"
            />
            {pingMs !== null ? `${pingMs}ms` : '—'}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Robinhood Chain Ping</TooltipContent>
      </Tooltip>
    </div>
  );
}
