'use client';

import { useMemo } from 'react';
import OgShareDialogBase from '~/components/shared/OgShareDialog';

interface ShareDialogProps {
  question: string;
  side?: string;
  wager?: number | string;
  payout?: number | string;
  symbol?: string;
  groupAddress?: string;
  marketId?: number | string;
  positionId?: number | string;
  owner?: string;
  extraParams?: Record<string, string>;
  trigger?: React.ReactNode;
  imagePath?: string; // defaults to OG position path for now
  title?: string; // dialog title
  legs?: { question: string; choice: 'Yes' | 'No' }[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ShareDialog(props: ShareDialogProps) {
  const {
    question,
    side,
    wager,
    payout,
    symbol,
    groupAddress,
    marketId,
    positionId,
    owner,
    extraParams,
    trigger,
    imagePath = '/og/trade',
    title = 'Share',
    open: controlledOpen,
    onOpenChange,
  } = props;

  const formatAmount = (val: number): string => {
    if (!Number.isFinite(val)) return '0';
    return val.toFixed(val < 1 ? 4 : 2);
  };

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (groupAddress && marketId != null) {
      sp.set('group', groupAddress);
      sp.set('mid', String(marketId));
    }
    sp.set('q', question);
    if (side) sp.set('dir', side);
    if (typeof wager !== 'undefined')
      sp.set('wager', formatAmount(Number(wager)));
    if (typeof payout !== 'undefined')
      sp.set('payout', formatAmount(Number(payout)));
    if (symbol) sp.set('symbol', symbol);
    if (positionId != null) sp.set('pid', String(positionId));
    if (owner) sp.set('addr', owner);
    if (props.legs && Array.isArray(props.legs)) {
      for (const leg of props.legs) {
        const q = (leg?.question ?? '').toString();
        const c = leg?.choice === 'Yes' ? 'Yes' : 'No';
        if (q) sp.append('leg', `${q}|${c}`);
      }
    }
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => {
        if (typeof v === 'string') sp.set(k, v);
      });
    }
    return sp.toString();
  }, [
    question,
    side,
    wager,
    payout,
    symbol,
    groupAddress,
    marketId,
    positionId,
    owner,
    extraParams,
    props.legs,
  ]);

  const imageSrc = `${imagePath}?${queryString}`;

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      title={title}
      trigger={trigger}
      shareTitle={title}
      shareText={question}
      open={controlledOpen}
      onOpenChange={onOpenChange}
      loaderSizePx={48}
      copyButtonText="Copy Image"
      shareButtonText="Share"
    />
  );
}
