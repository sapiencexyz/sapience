'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Copy, Share2 } from 'lucide-react';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { PositionType } from '@sapience/ui/types';
import LottieLoader from '../shared/LottieLoader';

interface SharePositionDialogProps {
  position: PositionType;
  trigger?: React.ReactNode;
  /** Override the default wager value in the share payload (e.g., use Entry for closed trades) */
  wagerOverride?: number | string;
  /** Override the payout value in the share payload (e.g., use Exit for closed trades) */
  payoutOverride?: number | string;
  /** Extra query params to include in the share URL */
  extraParams?: Record<string, string>;
}

// no-op: we now send the full address for OG rendering

export default function SharePositionDialog({
  position,
  trigger,
  wagerOverride,
  payoutOverride,
  extraParams,
}: SharePositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [cacheBust, setCacheBust] = useState('');
  const [imgLoading, setImgLoading] = useState(true);
  const { toast } = useToast();

  const { market } = position;
  const group = market?.marketGroup;

  const question = market?.question || 'Prediction Market';
  const isYesNo = group?.baseTokenName === 'Yes';
  const side = (() => {
    const baseTokenName = group?.baseTokenName;
    const base = BigInt(position.baseToken || '0');
    const borrowed = BigInt(position.borrowedBaseToken || '0');
    const net = base - borrowed;
    if (baseTokenName === 'Yes') {
      return net >= 0n ? 'on Yes' : 'on No';
    }
    return net >= 0n ? 'long' : 'short';
  })();

  const formatAmount = (val: number): string => {
    if (!Number.isFinite(val)) return '0';
    return val.toFixed(val < 1 ? 4 : 2);
  };

  const wager = useMemo(() => {
    try {
      if (typeof wagerOverride !== 'undefined') {
        const numeric =
          typeof wagerOverride === 'string'
            ? Number(wagerOverride)
            : wagerOverride;
        return formatAmount(Number(numeric));
      }
      const wei = BigInt(position.collateral || '0');
      const val = Number(wei) / 1e18;
      return formatAmount(val);
    } catch {
      return '0';
    }
  }, [position.collateral, wagerOverride]);

  const symbol = group?.collateralSymbol || '';
  const maxPayout = useMemo(() => {
    if (!isYesNo) return '';
    try {
      const base = BigInt(position.baseToken || '0');
      const borrowed = BigInt(position.borrowedBaseToken || '0');
      const net = base - borrowed;
      const amount = net >= 0n ? base : borrowed;
      const val = Number(amount) / 1e18;
      return formatAmount(val);
    } catch {
      return '0';
    }
  }, [isYesNo, position.baseToken, position.borrowedBaseToken]);

  // Exit value should reflect payoutOverride when provided, regardless of market type
  const exitValue = useMemo(() => {
    if (typeof payoutOverride === 'undefined') return '';
    const numeric =
      typeof payoutOverride === 'string'
        ? Number(payoutOverride)
        : payoutOverride;
    return formatAmount(Number(numeric));
  }, [payoutOverride]);
  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    // Prefer identifier-based params
    const groupAddress = group?.address;
    const marketId = position.market?.marketId;
    if (groupAddress && marketId && position.positionId) {
      sp.set('group', groupAddress);
      sp.set('mid', String(marketId));
    }
    // Always provide text fallbacks so the route can render even if fetch fails
    sp.set('q', question);
    sp.set('dir', side);
    // For closed trades, wagerOverride should represent entry, payoutOverride exit.
    sp.set('wager', wager);
    if (maxPayout) {
      sp.set('payout', maxPayout);
    }
    // Also include explicit entry/exit for richer previews when available
    if (typeof wagerOverride !== 'undefined') sp.set('entry', wager);
    if (exitValue) sp.set('exit', exitValue);
    // Append any caller-provided extra params
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => {
        if (typeof v === 'string') sp.set(k, v);
      });
    }
    if (symbol) sp.set('symbol', symbol);
    if (position.positionId) sp.set('pid', String(position.positionId));
    if (position.owner) sp.set('addr', position.owner);
    return sp.toString();
  }, [
    question,
    side,
    wager,
    symbol,
    position.positionId,
    position.owner,
    isYesNo,
    maxPayout,
    exitValue,
    extraParams,
  ]);

  // Use relative URL for next/image to avoid remote host config
  const imageSrc = `/og/position?${queryString}`;

  // Absolute URL for copying/opening in a new tab
  const shareUrl = useMemo(() => {
    const base = `/og/position?${queryString}`;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${base}`;
    }
    return base;
  }, [queryString]);

  // Update cache bust param whenever dialog opens
  useEffect(() => {
    if (open) setCacheBust(String(Date.now()));
  }, [open]);

  // Append cache-busting param only for the preview image to avoid cached renders
  const previewSrc = `${imageSrc}${cacheBust ? `&cb=${cacheBust}` : ''}`;

  // Reset loader when the preview source changes
  useEffect(() => {
    setImgLoading(true);
  }, [previewSrc]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader className="pb-2">
          <DialogTitle>Share Your Wager</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="w-full aspect-[1200/630] bg-muted rounded overflow-hidden relative border border-border">
            {/* Use next/image to fetch the OG image */}
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LottieLoader width={32} height={32} />
              </div>
            )}
            <Image
              src={previewSrc}
              alt="Share preview"
              fill
              sizes="(max-width: 768px) 100vw, 720px"
              onLoad={() => setImgLoading(false)}
              onError={() => setImgLoading(false)}
              priority
            />
          </div>
          <div className="flex gap-3">
            <Button
              size="lg"
              className="w-1/2"
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch(shareUrl, { cache: 'no-store' });
                  const blob = await res.blob();
                  // Try copying image to clipboard
                  if (navigator.clipboard && window.ClipboardItem) {
                    const item = new ClipboardItem({ [blob.type]: blob });
                    await navigator.clipboard.write([item]);
                  } else {
                    await navigator.clipboard.writeText(shareUrl);
                  }
                  toast({ title: 'Image copied successfully' });
                } catch {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    toast({ title: 'Image copied successfully' });
                  } catch {
                    // ignore
                  }
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy Image
            </Button>
            <Button
              size="lg"
              className="w-1/2"
              type="button"
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: 'Share',
                      text: question,
                      url: shareUrl,
                    });
                    return;
                  } catch {
                    // fallthrough
                  }
                }
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
