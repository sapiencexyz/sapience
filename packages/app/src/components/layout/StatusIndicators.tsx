'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  ENV_DEFAULT_CHAIN_ID,
  isRobinhoodChain,
} from '@sapience/sdk/constants';
import Image from 'next/image';
import { useRpcPing } from '~/hooks/blockchain/useRpcPing';
import { useSettings } from '~/lib/context/SettingsContext';

export const ETHENA_BASE_APY = 3.8;

export function StatusIndicators() {
  const pingMs = useRpcPing();
  const { customChainId } = useSettings();
  const isRobinhood = isRobinhoodChain(customChainId ?? ENV_DEFAULT_CHAIN_ID);
  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-1.5 text-xs">
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
      <span className="hidden xl:inline text-muted-foreground/60 mx-1">·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums cursor-default">
            <Image
              src={
                isRobinhood
                  ? '/robinhood-logomark.svg'
                  : '/ethereal-logomark.svg'
              }
              alt={isRobinhood ? 'Robinhood' : 'Ethereal'}
              width={14}
              height={14}
              className="opacity-70"
            />
            {pingMs !== null ? `${pingMs}ms` : '—'}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isRobinhood ? 'Robinhood Chain Ping' : 'Ethereal Ping'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
