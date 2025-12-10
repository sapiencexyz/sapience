'use client';

import Image from 'next/image';
import { Copy } from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
  lzPMResolver,
  lzUmaResolver,
} from '@sapience/sdk/contracts/addresses';
import { ConditionStatusIndicator } from './ConditionStatusIndicator';
import { UMA_RESOLVER_ADDRESSES } from '~/lib/constants';

interface TechSpecTableProps {
  conditionId: string;
  chainId: number;
  endTime?: number | null;
  settled?: boolean | null;
  resolvedToYes?: boolean | null;
}

export function TechSpecTable({
  conditionId,
  chainId,
  endTime,
  settled,
  resolvedToYes,
}: TechSpecTableProps) {
  const marketAddress = predictionMarket[chainId]?.address;
  const resolverAddress =
    lzPMResolver[chainId]?.address ??
    lzUmaResolver[chainId]?.address ??
    umaResolver[chainId]?.address;

  const isUmaResolver =
    resolverAddress &&
    UMA_RESOLVER_ADDRESSES.has(resolverAddress.toLowerCase());

  const formatAddress = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <table className="w-full text-xs border-collapse">
      <tbody className="divide-y divide-border/60">
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap w-24 align-middle leading-none">
            Escrow
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all align-middle leading-none">
            {marketAddress ? (
              <span className="inline-flex items-center gap-1.5 align-middle leading-none">
                <a
                  href="https://explorer.ethereal.trade/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center hover:opacity-90 transition-opacity"
                  aria-label="Visit Ethereal explorer"
                >
                  <Image
                    src="/ethereal-logomark.svg"
                    alt="Ethereal"
                    width={24}
                    height={24}
                    className="h-[18px] w-[18px]"
                  />
                </a>
                {formatAddress(marketAddress)}
                <button
                  type="button"
                  onClick={() => copyToClipboard(marketAddress)}
                  className="text-muted-foreground hover:text-brand-white transition-colors"
                  title="Copy full escrow address"
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
            Resolver
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all align-middle leading-none">
            {resolverAddress ? (
              <span className="inline-flex items-center gap-1.5 align-middle leading-none">
                {isUmaResolver && (
                  <a
                    href="https://uma.xyz/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:opacity-90 transition-opacity"
                    aria-label="Visit UMA website"
                  >
                    <Image
                      src="/uma-logomark.png"
                      alt="UMA"
                      width={24}
                      height={24}
                      className="h-[18px] w-[18px]"
                    />
                  </a>
                )}
                {formatAddress(resolverAddress)}
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
              />
              {formatAddress(conditionId)}
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
