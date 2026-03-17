'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import Image from 'next/image';
import { PeerIndicator } from '~/components/relay/PeerIndicator';
import { useRpcPing } from '~/hooks/blockchain/useRpcPing';

export const ETHENA_BASE_APY = 4;

export function StatusIndicators() {
  const pingMs = useRpcPing();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1.5 text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://ethena.fi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5"
            aria-label="Ethena"
          >
            <Image
              src="/ethena-circle.svg"
              alt="Ethena"
              width={16}
              height={16}
              className="opacity-90 hover:opacity-100 transition-opacity duration-200"
            />
            <span className="font-mono text-xs text-ethena">
              {ETHENA_BASE_APY.toFixed(1)}% APY
            </span>
          </a>
        </TooltipTrigger>
        <TooltipContent side="top">Ethena APY</TooltipContent>
      </Tooltip>
      <span className="hidden sm:inline text-muted-foreground/60 mx-1">·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums cursor-default">
            <Image
              src="/ethereal-logomark.svg"
              alt="Ethereal"
              width={14}
              height={14}
              className="opacity-70"
            />
            {pingMs !== null ? `${pingMs}ms` : '—'}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Ethereal Ping</TooltipContent>
      </Tooltip>
      <span className="hidden sm:inline text-muted-foreground/60 mx-1">·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">
            <PeerIndicator />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Sapience Mesh Network</TooltipContent>
      </Tooltip>
    </div>
  );
}
