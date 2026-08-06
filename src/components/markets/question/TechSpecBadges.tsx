'use client';

import Image from 'next/image';
import { Copy } from 'lucide-react';
import { ConditionStatusIndicator } from './ConditionStatusIndicator';
import { Badge } from '~/components/ui/badge';
import { PythOracleMark } from '~/components/shared/PythOracleMark';
import { POLYMARKET_RESOLVER_ADDRESSES } from '~/lib/constants';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { shortenAddress } from '~/lib/utils/util';

interface TechSpecBadgesProps {
  conditionId: string;
  endTime?: number | null;
  settled?: boolean | null;
  resolvedToYes?: boolean | null;
  nonDecisive?: boolean | null;
  resolverAddress?: string;
}

const BADGE_CLASS =
  'h-7 items-center gap-2 px-2.5 text-xs leading-none inline-flex bg-card/60 border-brand-white/10 text-brand-white/80 font-medium';
const LABEL_CLASS =
  'text-[10px] text-muted-foreground font-mono uppercase tracking-wider';
const DIVIDER_CLASS = 'h-3 w-px bg-muted-foreground/25';

/**
 * Resolver and condition rendered as header badges, matching the Open Interest
 * and end-time pills. These replaced a two-row table that sat in a desktop
 * sidebar; as badges the same information stays visible at every breakpoint
 * and the chart gets the full width.
 */
export function TechSpecBadges({
  conditionId,
  endTime,
  settled,
  resolvedToYes,
  nonDecisive,
  resolverAddress,
}: TechSpecBadgesProps) {
  const isPolymarketResolver =
    !!resolverAddress &&
    POLYMARKET_RESOLVER_ADDRESSES.has(resolverAddress.toLowerCase());
  const isPythResolver = inferResolverKind(resolverAddress) === 'pyth';

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <>
      {resolverAddress && (
        <Badge variant="outline" className={BADGE_CLASS}>
          <span className={LABEL_CLASS}>Resolver</span>
          <span aria-hidden="true" className={DIVIDER_CLASS} />
          <span className="inline-flex items-center gap-1.5 font-mono">
            {isPolymarketResolver && (
              <a
                href="https://polymarket.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit Polymarket website"
                className="inline-flex"
              >
                <Image
                  src="/polymarket-logomark.png"
                  alt="Polymarket"
                  width={16}
                  height={16}
                  className="rounded-full"
                />
              </a>
            )}
            {isPythResolver && <PythOracleMark />}
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
        </Badge>
      )}

      <Badge variant="outline" className={BADGE_CLASS}>
        <span className={LABEL_CLASS}>Condition</span>
        <span aria-hidden="true" className={DIVIDER_CLASS} />
        <span className="inline-flex items-center gap-1.5 font-mono">
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
            title="Copy full condition ID"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
      </Badge>
    </>
  );
}

export default TechSpecBadges;
