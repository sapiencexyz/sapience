'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import Image from 'next/image';
import Link from 'next/link';
import { Copy, Share2, Check } from 'lucide-react';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import * as viemChains from 'viem/chains';
import Loader from '~/components/shared/Loader';
import { useUserParlays, type Parlay } from '~/hooks/graphql/useUserParlays';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

interface OgShareDialogBaseProps {
  imageSrc: string; // Relative path with query, e.g. "/og/trade?..."
  title?: string; // Dialog title
  trigger?: React.ReactNode;
  shareTitle?: string; // Title for navigator.share
  shareText?: string; // Text for navigator.share
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  loaderSizePx?: number; // defaults to 20 for consistency
  copyButtonText?: string; // defaults to "Copy Image"
  shareButtonText?: string; // defaults to "Share"
  trackPosition?: boolean; // Enable position tracking
  txHash?: string; // Optional tx hash for explorer link while pending
  positionTimestamp?: number; // Timestamp when position was placed (ms)
  expectedLegs?: Array<{ question: string; choice: 'Yes' | 'No' }>; // Expected conditions from betslip for validation
  lastNftId?: string; // Last NFT ID before this parlay was submitted (for validation)
}

export default function OgShareDialogBase(props: OgShareDialogBaseProps) {
  const {
    imageSrc,
    title = 'Share',
    trigger,
    shareTitle: _shareTitle = 'Share',
    shareText: _shareText,
    open: controlledOpen,
    onOpenChange,
    loaderSizePx = 20,
    copyButtonText = 'Copy Image',
    shareButtonText = 'Share',
    trackPosition = false,
    txHash,
    positionTimestamp,
    expectedLegs,
    lastNftId,
  } = props;
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

  const [cacheBust, setCacheBust] = useState('');
  const [imgLoading, setImgLoading] = useState(true);
  const { toast } = useToast();
  const { address } = useAccount();
  const chainId = useChainIdFromLocalStorage();
  const [positionResolved, setPositionResolved] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dialogOpenTimestampRef = useRef<number | null>(null);

  // Get user address for position tracking
  const userAddress = address?.toLowerCase();

  // Fetch positions for tracking
  const { data: positions, refetch: refetchPositions } = useUserParlays({
    address: trackPosition && userAddress ? userAddress : undefined,
    chainId,
    take: 10, // Only need recent positions
    orderBy: 'mintedAt',
    orderDirection: 'desc',
  });

  // Position tracking logic
  useEffect(() => {
    if (!trackPosition || !open || !userAddress) {
      setPositionResolved(false);
      return;
    }

    // Reset tracking state when positionTimestamp changes (new parlay)
    const currentTimestamp = positionTimestamp || Date.now();
    const timestampChanged =
      dialogOpenTimestampRef.current !== currentTimestamp;

    if (timestampChanged) {
      setPositionResolved(false);
      dialogOpenTimestampRef.current = currentTimestamp;
      // Clear any existing polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    const checkPosition = (positionsToCheck: Parlay[]) => {
      if (!positionsToCheck || positionsToCheck.length === 0) {
        return false;
      }

      const minTimestamp =
        (dialogOpenTimestampRef.current || Date.now()) - 2 * 60 * 1000; // 2 minute window
      const minTimestampSeconds = Math.floor(minTimestamp / 1000);

      // Find positions minted after the dialog opened
      const candidatePositions = positionsToCheck.filter((p: Parlay) => {
        const mintedAtSeconds = Number(p.mintedAt);
        const passes = mintedAtSeconds >= minTimestampSeconds;
        return passes;
      });

      if (candidatePositions.length === 0) {
        return false;
      }

      // Filter by NFT ID if lastNftId is provided (must be larger than last known NFT ID)
      let filteredByNftId = candidatePositions;
      if (lastNftId) {
        try {
          const lastNftIdBigInt = BigInt(lastNftId);
          filteredByNftId = candidatePositions.filter((p: Parlay) => {
            try {
              const currentNftId = BigInt(p.predictorNftTokenId || '0');
              return currentNftId > lastNftIdBigInt;
            } catch (err) {
              console.error(
                '[OgShareDialog] Position indexing: Error comparing NFT ID for position',
                {
                  positionId: p.id,
                  nftId: p.predictorNftTokenId,
                  error: err,
                }
              );
              return false;
            }
          });

          if (filteredByNftId.length === 0) {
            console.warn(
              '[OgShareDialog] Position indexing: No candidates after NFT ID filter',
              {
                lastNftId,
                candidateCount: candidatePositions.length,
                candidates: candidatePositions.map((p) => ({
                  id: p.id,
                  nftId: p.predictorNftTokenId,
                })),
              }
            );
            return false;
          }
        } catch (_e) {
          console.error(
            '[OgShareDialog] Position indexing: Error comparing NFT IDs:',
            _e
          );
          // Error comparing NFT IDs
        }
      }

      // If expectedLegs are provided, verify the position matches the submitted conditions
      if (expectedLegs && expectedLegs.length > 0) {
        const foundPosition = filteredByNftId.find((p: Parlay) => {
          const positionLegs = (p.predictions || []).map((pred) => {
            const question =
              pred.condition?.shortName || pred.condition?.question || '';
            const choice = pred.outcomeYes ? 'Yes' : 'No';
            return { question, choice };
          });

          // Check if all expected legs match the position's predictions
          if (positionLegs.length !== expectedLegs.length) {
            return false;
          }

          // Create maps for easier comparison
          const expectedMap = new Map(
            expectedLegs.map((leg) => [`${leg.question}|${leg.choice}`, true])
          );
          const positionMap = new Map(
            positionLegs.map((leg) => [`${leg.question}|${leg.choice}`, true])
          );

          // Check if all expected legs are present in position
          for (const leg of expectedLegs) {
            const key = `${leg.question}|${leg.choice}`;
            if (!positionMap.has(key)) {
              return false;
            }
          }

          // Check if all position legs are in expected (to ensure exact match)
          for (const leg of positionLegs) {
            const key = `${leg.question}|${leg.choice}`;
            if (!expectedMap.has(key)) {
              return false;
            }
          }

          return true;
        });

        if (foundPosition) {
          console.log('[OgShareDialog] Position indexed by FE', {
            positionId: foundPosition.id,
            nftId: foundPosition.predictorNftTokenId,
            chainId: foundPosition.chainId,
            mintedAt: foundPosition.mintedAt,
            lastNftId,
            expectedLegsCount: expectedLegs?.length || 0,
          });
          setPositionResolved(true);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return true;
        }
        console.warn(
          '[OgShareDialog] Position indexing: No position matched expected legs',
          {
            expectedLegs,
            checkedPositions: filteredByNftId.map((p) => ({
              id: p.id,
              legs: (p.predictions || []).map((pred) => ({
                question: pred.condition?.shortName || pred.condition?.question,
                choice: pred.outcomeYes ? 'Yes' : 'No',
              })),
            })),
          }
        );
        return false;
      }

      // Fallback: if no expectedLegs provided, use first candidate after NFT ID filter (backward compatibility)
      console.warn(
        '[OgShareDialog] Position indexing: Using fallback (no expected legs) - this should be avoided!',
        {
          candidates: filteredByNftId.length,
          candidateIds: filteredByNftId.map((p) => p.id),
          hasExpectedLegs: !!(expectedLegs && expectedLegs.length > 0),
        }
      );
      const foundPosition = filteredByNftId[0];
      if (foundPosition) {
        console.log('[OgShareDialog] Position indexed by FE (fallback)', {
          positionId: foundPosition.id,
          nftId: foundPosition.predictorNftTokenId,
          chainId: foundPosition.chainId,
          mintedAt: foundPosition.mintedAt,
          lastNftId,
          note: 'Using fallback - no expected legs provided',
        });
        setPositionResolved(true);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
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
      // Poll every second
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const result = await refetchPositions();
          const latestPositions = result.data || [];
          checkPosition(latestPositions);
        } catch (_error) {
          console.error(
            '[OgShareDialog] Position indexing: Error refetching positions',
            _error
          );
        }
      }, 1000);
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
    positions,
    refetchPositions,
    positionTimestamp,
    expectedLegs,
    lastNftId,
  ]);

  // Reset tracking state when dialog closes
  useEffect(() => {
    if (!open) {
      setPositionResolved(false);
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

  // Build share URL - use nftId and marketAddress if available
  // Returns absolute URL for sharing
  const buildShareUrl = useCallback((): string => {
    let relativeUrl: string;

    // If nftId and marketAddress are available, use them
    if (positionShareParams?.nftId && positionShareParams?.marketAddress) {
      const qp = new URLSearchParams();
      qp.set('nftId', positionShareParams.nftId);
      qp.set('marketAddress', positionShareParams.marketAddress);
      relativeUrl = `/share?${qp.toString()}`;
    } else {
      // If no position parameters are available, fall back to share page without params
      relativeUrl = '/share';
    }

    // Convert to absolute URL
    if (typeof window !== 'undefined') {
      // Check if relativeUrl is already absolute
      if (relativeUrl.startsWith('http')) {
        return relativeUrl;
      }
      return `${window.location.origin}${relativeUrl}`;
    }
    return relativeUrl;
  }, [positionShareParams]);

  // Absolute URL to the actual image route (for copying image binary)
  const absoluteImageUrl = useMemo(() => {
    if (typeof window !== 'undefined')
      return `${window.location.origin}${imageSrc}`;
    return imageSrc;
  }, [imageSrc]);

  const explorerTxUrl = useMemo(() => {
    if (!txHash || !chainId) return null;
    const ETHEREAL_CHAIN_ID = 5064014;
    const etherealExplorer = 'https://explorer.ethereal.trade';

    const baseUrl =
      chainId === ETHEREAL_CHAIN_ID
        ? etherealExplorer
        : (Object.values(viemChains).find((c: any) => c?.id === chainId) as any)
            ?.blockExplorers?.default?.url;

    if (!baseUrl) return null;
    return `${String(baseUrl).replace(/\/$/, '')}/tx/${txHash}`;
  }, [txHash, chainId]);

  useEffect(() => {
    if (open) setCacheBust(String(Date.now()));
  }, [open]);

  const previewSrc = `${imageSrc}${cacheBust ? `&cb=${cacheBust}` : ''}`;

  useEffect(() => {
    setImgLoading(true);
  }, [previewSrc]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader className="pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Position tracking section */}
          {trackPosition && open && userAddress && !positionResolved && (
            <div className="w-full p-4 bg-muted/50 rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2 text-sm text-muted-foreground">
                <Loader size={20} className="shrink-0" />
                <span>Waiting for position to be indexed...</span>
                {explorerTxUrl ? (
                  <Link
                    href={explorerTxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    View on explorer
                  </Link>
                ) : null}
              </div>
            </div>
          )}
          {trackPosition && positionResolved && (
            <div className="w-full p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400 text-center flex items-center justify-center gap-2">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>
                  Position created.{' '}
                  {userAddress && (
                    <Link
                      href={`/profile/${userAddress}#positions`}
                      className="underline underline-offset-2 hover:text-green-700 dark:hover:text-green-300 transition-colors"
                    >
                      View portfolio
                    </Link>
                  )}
                </span>
              </p>
            </div>
          )}
          <div className="w-full aspect-[1200/630] bg-muted rounded overflow-hidden relative border border-border">
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader size={loaderSizePx} />
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
          <div className="grid grid-cols-3 gap-4">
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
                  if (navigator.clipboard && (window as any).ClipboardItem) {
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
              <Copy className="mr-0.5 h-4 w-4" /> {copyButtonText}
            </Button>
            {/* Post (X) - middle */}
            <Button
              size="lg"
              className="w-full"
              type="button"
              disabled={trackPosition && !positionResolved}
              onClick={() => {
                const shareUrl = buildShareUrl();
                const intent = buildXShareUrl(shareUrl);
                window.open(intent, '_blank', 'noopener,noreferrer');
              }}
            >
              <Image
                src="/x.svg"
                alt="X"
                width={14}
                height={14}
                className="mr-0.5 dark:invert"
              />
              Post
            </Button>
            {/* Share */}
            <Button
              size="lg"
              className="w-full"
              type="button"
              variant="outline"
              disabled={trackPosition && !positionResolved}
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
              <Share2 className="mr-0.5 h-4 w-4" /> {shareButtonText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
