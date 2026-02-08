'use client';

import { useMemo } from 'react';
import OgShareDialogBase from '~/components/shared/OgShareDialog';

function formatAmount(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return val.toFixed(val < 1 ? 4 : 2);
}

interface ShareDialogProps {
  question: string;
  side?: string;
  positionSize?: number | string;
  payout?: number | string;
  symbol?: string;
  groupAddress?: string;
  marketId?: number | string;
  positionId?: number | string; // Deprecated: use nftId and marketAddress instead
  nftId?: string; // NFT token ID (predictorNftTokenId)
  marketAddress?: string; // Prediction market address
  owner?: string;
  extraParams?: Record<string, string>;
  trigger?: React.ReactNode;
  imagePath?: string; // defaults to OG position path for now
  title?: string; // dialog title
  legs?: Array<{ question: string; choice: string }>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ShareDialog({
  question,
  side,
  positionSize,
  payout,
  symbol,
  groupAddress,
  marketId,
  positionId,
  nftId,
  marketAddress,
  owner,
  extraParams,
  trigger,
  imagePath = '/og/position',
  title = 'Share',
  open: controlledOpen,
  onOpenChange,
  legs,
}: ShareDialogProps) {
  const queryString = useMemo(() => {
    const sp = new URLSearchParams();

    // If nftId and marketAddress are provided and we're using /og/position, use them
    // This allows the edge endpoint to query the API for position data
    if (nftId && marketAddress && imagePath === '/og/position') {
      sp.set('nftId', String(nftId));
      sp.set('marketAddress', String(marketAddress));
      return sp.toString();
    }

    // Otherwise, build query string from all parameters (backward compatibility)
    if (groupAddress && marketId != null) {
      sp.set('group', groupAddress);
      sp.set('mid', String(marketId));
    }
    sp.set('q', question);
    if (side) sp.set('dir', side);
    if (typeof positionSize !== 'undefined')
      sp.set('wager', formatAmount(Number(positionSize)));
    if (typeof payout !== 'undefined')
      sp.set('payout', formatAmount(Number(payout)));
    if (symbol) sp.set('symbol', symbol);
    if (positionId != null) sp.set('pid', String(positionId));
    if (owner) sp.set('addr', owner);
    if (legs) {
      for (const leg of legs) {
        const q = (leg?.question ?? '').toString().replace(/\|/g, ' ').trim();
        const c = (leg?.choice ?? '').toString().replace(/\|/g, ' ').trim();
        if (q && c) sp.append('leg', `${q}|${c}`);
      }
    }
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => {
        // Exclude chainId from query string
        if (typeof v === 'string') {
          sp.set(k, v);
        }
      });
    }
    return sp.toString();
  }, [
    question,
    side,
    positionSize,
    payout,
    symbol,
    groupAddress,
    marketId,
    positionId,
    nftId,
    marketAddress,
    owner,
    extraParams,
    legs,
    imagePath,
  ]);

  // Note: OgShareDialog handles cache busting via its own cacheBust mechanism
  // Don't add timestamp here or the image URL will change on every render
  const imageSrc = `${imagePath}?${queryString}`;

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      title={title}
      trigger={trigger}
      open={controlledOpen}
      onOpenChange={onOpenChange}
    />
  );
}
