'use client';

import Image from 'next/image';
import { Copy } from 'lucide-react';
import { PythOracleMark } from '@sapience/ui';
import { ConditionStatusIndicator } from './ConditionStatusIndicator';
import { POLYMARKET_RESOLVER_ADDRESSES } from '~/lib/constants';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { shortenAddress } from '~/lib/utils/util';

interface TechSpecTableProps {
  conditionId: string;
  endTime?: number | null;
  settled?: boolean | null;
  resolvedToYes?: boolean | null;
  nonDecisive?: boolean | null;
  resolverAddress?: string | null;
}

export function TechSpecTable({
  conditionId,
  endTime,
  settled,
  resolvedToYes,
  nonDecisive,
  resolverAddress,
}: TechSpecTableProps) {
  const isPolymarketResolver =
    resolverAddress &&
    POLYMARKET_RESOLVER_ADDRESSES.has(resolverAddress.toLowerCase());
  const isPythResolver = inferResolverKind(resolverAddress) === 'pyth';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <table className="w-full text-xs border-collapse">
      <tbody className="divide-y divide-border/60">
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap w-24 align-middle leading-none">
            Resolver
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all align-middle leading-none">
            {resolverAddress ? (
              <span className="inline-flex items-center gap-1.5 align-middle leading-none">
                {isPolymarketResolver && (
                  <a
                    href="https://polymarket.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:opacity-90 transition-opacity"
                    aria-label="Visit Polymarket website"
                  >
                    <Image
                      src="/polymarket-logomark.png"
                      alt="Polymarket"
                      width={24}
                      height={24}
                      className="h-[18px] w-[18px]"
                    />
                  </a>
                )}
                {isPythResolver && (
                  <a
                    href="https://pyth.network/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:opacity-90 transition-opacity"
                    aria-label="Visit Pyth Network"
                  >
                    <div className="h-[18px] w-[18px] rounded-full bg-muted flex items-center justify-center">
                      <PythOracleMark
                        className="h-3 w-3 text-foreground/80"
                        src="/pyth-network.svg"
                        alt="Pyth"
                      />
                    </div>
                  </a>
                )}
                {shortenAddress(resolverAddress)}
                <button
                  type="button"
                  onClick={() => copyToClipboard(resolverAddress)}
                  className="text-muted-foreground hover:text-brand-white transition-colors"
                  title="Copy full resolver address"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </span>
            ) : (
              '—'
            )}
          </td>
        </tr>
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap w-24 align-middle leading-none">
            Condition
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all align-middle leading-none">
            <span className="inline-flex items-center gap-1.5 align-middle leading-none">
              <ConditionStatusIndicator
                endTime={endTime}
                settled={settled}
                resolvedToYes={resolvedToYes}
                nonDecisive={nonDecisive}
              />
              {shortenAddress(conditionId)}
              <button
                type="button"
                onClick={() => copyToClipboard(conditionId)}
                className="text-muted-foreground hover:text-brand-white transition-colors"
                title="Copy full condition"
              >
                <Copy className="h-3 w-3" />
              </button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
