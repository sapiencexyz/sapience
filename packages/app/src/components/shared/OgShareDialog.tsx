'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import Link from 'next/link';
import { Image as ImageIcon, Share2, User } from 'lucide-react';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PositionProgressBar from '~/components/shared/PositionProgressBar';
import {
  useUserPositions,
  type Position,
} from '~/hooks/graphql/useUserPositions';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useSession } from '~/lib/context/SessionContext';
import type { PositionProgressState } from '~/types/positionProgress';

// Stable counter for cache busting - increments each time a dialog opens
let dialogOpenCounter = 0;

function picksMatch(
  positionPicks: Array<{ question: string; choice: string }>,
  expectedPicks: Array<{ question: string; choice: string }>
): boolean {
  if (positionPicks.length !== expectedPicks.length) {
    return false;
  }

  const toKey = (leg: { question: string; choice: string }): string =>
    `${leg.question}|${leg.choice}`;

  const expectedSet = new Set(expectedPicks.map(toKey));
  const positionSet = new Set(positionPicks.map(toKey));

  // Check both sets have identical keys
  if (expectedSet.size !== positionSet.size) {
    return false;
  }

  for (const key of expectedSet) {
    if (!positionSet.has(key)) {
      return false;
    }
  }

  return true;
}

interface OgShareDialogBaseProps {
  imageSrc: string; // Relative path with query, e.g. "/og/trade?..."
  title?: string; // Dialog title
  trigger?: React.ReactNode;
  shareTitle?: string; // Unused but kept for backward compatibility
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trackPosition?: boolean; // Enable position tracking
  positionTimestamp?: number; // Timestamp when position was placed (ms)
  expectedPicks?: Array<{ question: string; choice: 'Yes' | 'No' }>; // Expected conditions from position form for validation
  expectedLegs?: Array<{ question: string; choice: 'Yes' | 'No' }>; // Alias for expectedPicks (backward compatibility)
  lastNftId?: string; // Last NFT ID before this position was submitted (for validation)
  progressState?: PositionProgressState; // Progress state for showing submission stages
  onPositionIndexed?: () => void; // Called when position is found in GraphQL
}

export default function OgShareDialogBase({
  imageSrc,
  title = 'Trade Submitted',
  trigger,
  open: controlledOpen,
  onOpenChange,
  trackPosition = false,
  positionTimestamp,
  expectedPicks,
  expectedLegs,
  lastNftId,
  progressState,
  onPositionIndexed,
}: OgShareDialogBaseProps) {
  // Support both expectedPicks and expectedLegs for backward compatibility
  const picks = expectedPicks || expectedLegs;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = typeof controlledOpen === 'boolean';
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled
    ? (val: boolean) => {
        if (onOpenChange) {
          onOpenChange(val);
        }
      }
    : setUncontrolledOpen;

  // Track if we've already generated cacheBust for this dialog open session
  const cacheBustRef = useRef<string>('');
  const wasOpenRef = useRef(false);

  // Compute cacheBust synchronously during render (not in useEffect) to prevent double image load
  // This ensures the image src is correct on the very first render when dialog opens
  if (open && !wasOpenRef.current) {
    // Dialog just opened - generate new cacheBust
    dialogOpenCounter += 1;
    cacheBustRef.current = `${dialogOpenCounter}-${Date.now()}`;
    wasOpenRef.current = true;
  } else if (!open && wasOpenRef.current) {
    // Dialog just closed - reset for next open
    cacheBustRef.current = '';
    wasOpenRef.current = false;
  }

  const cacheBust = open ? cacheBustRef.current : '';

  const [imgLoading, setImgLoading] = useState(true);
  const { toast } = useToast();
  const { address } = useAccount();
  const { isSessionActive, smartAccountAddress } = useSession();
  const chainId = CHAIN_ID_ETHEREAL;
  const [positionResolved, setPositionResolved] = useState(false);
  // Store resolved position data for share URL
  const [resolvedPositionData, setResolvedPositionData] = useState<{
    nftId: string;
    marketAddress: string;
  } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dialogOpenTimestampRef = useRef<number | null>(null);

  // Get user address for position tracking - use smart account when session is active
  const userAddress = (
    isSessionActive && smartAccountAddress ? smartAccountAddress : address
  )?.toLowerCase();

  // Fetch positions for tracking
  const { data: positions, refetch: refetchPositions } = useUserPositions({
    address: trackPosition && userAddress ? userAddress : undefined,
    chainId,
    take: 10, // Only need recent positions
    orderBy: 'mintedAt',
    orderDirection: 'desc',
  });

  // Position tracking logic
  useEffect(() => {
    if (!trackPosition || !open || !userAddress) {
      return;
    }

    // Stop polling once position is resolved - prevents flickering
    if (positionResolved) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const resolvePosition = (position: Position): void => {
      setPositionResolved(true);
      setResolvedPositionData({
        nftId: position.predictorNftTokenId,
        marketAddress: position.marketAddress,
      });
      onPositionIndexed?.();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    const checkPosition = (positionsToCheck: Position[]): boolean => {
      if (!positionsToCheck || positionsToCheck.length === 0) {
        return false;
      }

      const minTimestamp =
        (dialogOpenTimestampRef.current || Date.now()) - 2 * 60 * 1000;
      const minTimestampSeconds = Math.floor(minTimestamp / 1000);

      const candidatePositions = positionsToCheck.filter((p: Position) => {
        const mintedAtSeconds = Number(p.mintedAt);
        return mintedAtSeconds >= minTimestampSeconds;
      });

      if (candidatePositions.length === 0) {
        return false;
      }

      let filteredByNftId = candidatePositions;
      if (lastNftId) {
        try {
          const lastNftIdBigInt = BigInt(lastNftId);
          filteredByNftId = candidatePositions.filter((p: Position) => {
            try {
              const currentNftId = BigInt(p.predictorNftTokenId || '0');
              return currentNftId > lastNftIdBigInt;
            } catch {
              return false;
            }
          });

          if (filteredByNftId.length === 0) {
            return false;
          }
        } catch {
          // Continue without NFT ID filter on parse error
        }
      }

      if (picks && picks.length > 0) {
        const foundPosition = filteredByNftId.find((p: Position) => {
          const positionPicks = (p.predictions || []).map((pred) => ({
            question:
              pred.condition?.shortName || pred.condition?.question || '',
            choice: pred.outcomeYes ? 'Yes' : 'No',
          }));
          return picksMatch(positionPicks, picks);
        });

        if (foundPosition) {
          resolvePosition(foundPosition);
          return true;
        }
        return false;
      }

      const foundPosition = filteredByNftId[0];
      if (foundPosition) {
        resolvePosition(foundPosition);
        return true;
      }
      return false;
    };

    // Initial check
    if (positions && positions.length > 0) {
      checkPosition(positions);
    }

    // Only start polling if not already polling (or if timestamp changed, restart polling)
    if (!pollingIntervalRef.current) {
      // Poll every half second
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const result = await refetchPositions();
          const latestPositions = result.data || [];
          checkPosition(latestPositions);
        } catch {
          // Error refetching positions - will retry on next interval
        }
      }, 500);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [
    trackPosition,
    open,
    userAddress,
    positionResolved,
    refetchPositions,
    picks,
    lastNftId,
    onPositionIndexed,
  ]);

  // Reset tracking state when dialog closes
  useEffect(() => {
    if (!open) {
      setPositionResolved(false);
      setResolvedPositionData(null); // Reset resolved position data
      setImgLoading(true); // Reset image loading state to prevent flash on reopen
      dialogOpenTimestampRef.current = null;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [open]);

  const buildXShareUrl = (
    url: string,
    opts?: { text?: string; via?: string; hashtags?: string[] }
  ) => {
    try {
      const u = new URL('https://twitter.com/intent/tweet');
      u.searchParams.set('url', url);
      if (opts?.text) u.searchParams.set('text', opts.text);
      if (opts?.via) u.searchParams.set('via', opts.via);
      if (opts?.hashtags?.length)
        u.searchParams.set('hashtags', opts.hashtags.join(','));
      return u.toString();
    } catch {
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
    }
  };

  // Extract nftId and marketAddress from imageSrc if present
  const positionShareParams = useMemo(() => {
    try {
      if (typeof window === 'undefined') return null;
      const url = new URL(imageSrc, window.location.origin);
      const nftId = url.searchParams.get('nftId');
      const marketAddress = url.searchParams.get('marketAddress');

      // Use NFT ID and market address
      if (nftId && marketAddress) {
        return { nftId, marketAddress };
      }
    } catch {
      // ignore
    }
    return null;
  }, [imageSrc]);

  const buildShareUrl = useCallback((): string => {
    const nftId = resolvedPositionData?.nftId || positionShareParams?.nftId;
    const marketAddress =
      resolvedPositionData?.marketAddress || positionShareParams?.marketAddress;

    let relativeUrl = '/share';
    if (nftId && marketAddress) {
      const qp = new URLSearchParams();
      qp.set('nftId', nftId);
      qp.set('marketAddress', marketAddress);
      relativeUrl = `/share?${qp.toString()}`;
    }

    if (typeof window === 'undefined') {
      return relativeUrl;
    }
    return `${window.location.origin}${relativeUrl}`;
  }, [resolvedPositionData, positionShareParams]);

  // Absolute URL to the actual image route (for copying image binary)
  const absoluteImageUrl = useMemo(() => {
    if (typeof window !== 'undefined')
      return `${window.location.origin}${imageSrc}`;
    return imageSrc;
  }, [imageSrc]);

  // Set dialogOpenTimestamp when dialog opens for position tracking
  useEffect(() => {
    if (open && trackPosition && !dialogOpenTimestampRef.current) {
      dialogOpenTimestampRef.current = positionTimestamp || Date.now();
    }
  }, [open, trackPosition, positionTimestamp]);

  const previewSrc = `${imageSrc}${cacheBust ? `&cb=${cacheBust}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader className="pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>
          <div className="w-full aspect-[1200/630] bg-[#0B0B0A] rounded overflow-hidden relative border border-border">
            {/* Hero background - persists behind the image */}
            <div className="absolute inset-0 z-0">
              <HeroBackgroundLines className="opacity-60 !-z-0" />
            </div>
            {/* Loading text for non-tracking mode */}
            {!trackPosition && imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span className="font-mono text-[hsl(var(--accent-gold))] text-lg uppercase tracking-wider">
                  LOADING...
                </span>
              </div>
            )}
            {/* OG Image - fades in over the waiting text and hero background */}
            {/* Using regular img tag to prevent Next.js Image from re-fetching on re-renders */}
            <img
              src={previewSrc}
              alt="Share preview"
              onLoad={() => setImgLoading(false)}
              onError={() => setImgLoading(false)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-20 ${
                imgLoading ? 'opacity-0' : 'opacity-100'
              }`}
            />
          </div>
          {/* Progress bar and buttons container - they cross-fade */}
          <div className="relative mt-4 min-h-[44px]">
            {/* Progress bar - fades out when resolved */}
            {trackPosition && progressState && (
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${
                  positionResolved
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100'
                }`}
              >
                <PositionProgressBar progressState={progressState} />
              </div>
            )}
            {/* Buttons - fade in on top of progress bar when resolved */}
            <div
              className={`absolute inset-0 flex items-center transition-opacity duration-500 ease-out ${
                trackPosition && !positionResolved
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100'
              }`}
            >
              <div
                className={`grid gap-4 w-full ${
                  trackPosition && userAddress ? 'grid-cols-4' : 'grid-cols-3'
                }`}
              >
                {/* Copy */}
                <Button
                  size="lg"
                  className="w-full"
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await fetch(absoluteImageUrl, {
                        cache: 'no-store',
                      });
                      const blob = await res.blob();
                      if (
                        navigator.clipboard &&
                        (window as any).ClipboardItem
                      ) {
                        const item = new (window as any).ClipboardItem({
                          [blob.type]: blob,
                        });
                        await navigator.clipboard.write([item]);
                        toast({ title: 'Image copied successfully' });
                        return;
                      }

                      // Fallback: generate compact share URL and copy as text
                      const shareUrl = buildShareUrl();
                      await navigator.clipboard.writeText(shareUrl);
                      toast({ title: 'Link copied successfully' });
                    } catch {
                      try {
                        const shareUrl = buildShareUrl();
                        await navigator.clipboard.writeText(shareUrl);
                        toast({ title: 'Link copied successfully' });
                      } catch {
                        // ignore
                      }
                    }
                  }}
                >
                  <ImageIcon className="mr-0.5 h-4 w-4" /> Copy
                </Button>
                {/* Post (X) */}
                <Button
                  size="lg"
                  className="w-full"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const shareUrl = buildShareUrl();
                    const intent = buildXShareUrl(shareUrl);
                    window.open(intent, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <svg
                    className="mr-0.5 h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                  </svg>
                  Post
                </Button>
                {/* Share */}
                <Button
                  size="lg"
                  className="w-full"
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const shareUrl = buildShareUrl();
                    if ((navigator as any).share) {
                      try {
                        await (navigator as any).share({ url: shareUrl });
                        return;
                      } catch {
                        // fallthrough
                      }
                    }
                    window.open(shareUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <Share2 className="mr-0.5 h-4 w-4" /> Share
                </Button>
                {/* Portfolio */}
                {trackPosition && userAddress && (
                  <Button
                    size="lg"
                    className="w-full"
                    type="button"
                    variant="outline"
                    asChild
                  >
                    <Link
                      href={`/profile/${userAddress}#positions`}
                      className="whitespace-nowrap"
                    >
                      <User className="mr-0.5 h-4 w-4" />
                      Portfolio
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
