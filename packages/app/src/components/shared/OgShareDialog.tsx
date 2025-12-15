'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/sdk/ui/components/ui/dialog';
import Image from 'next/image';
import Link from 'next/link';
import { Copy, Share2, Check } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import Loader from '~/components/shared/Loader';
import { useUserParlays, type Parlay } from '~/hooks/graphql/useUserParlays';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import PacmanEatingDots from '~/components/shared/PacmanEatingDots';

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
  positionTimestamp?: number; // Timestamp when position was placed (ms)
  expectedLegs?: Array<{ question: string; choice: 'Yes' | 'No' }>; // Expected conditions from betslip for validation
  lastNftId?: string; // Last NFT ID before this parlay was submitted (for validation)
}

export default function OgShareDialogBase(props: OgShareDialogBaseProps) {
  const {
    imageSrc,
    title = 'Share',
    trigger,
    shareTitle = 'Share',
    shareText,
    open: controlledOpen,
    onOpenChange,
    loaderSizePx = 20,
    copyButtonText = 'Copy Image',
    shareButtonText = 'Share',
    trackPosition = false,
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
        (dialogOpenTimestampRef.current || Date.now()) - 30000; // 45 seconds window
      const minTimestampSeconds = Math.floor(minTimestamp / 1000);

      // Find positions minted after the dialog opened
      const candidatePositions = positionsToCheck.filter(
        (p: Parlay) => Number(p.mintedAt) >= minTimestampSeconds
      );

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
              const isGreater = currentNftId > lastNftIdBigInt;
              return isGreater;
            } catch (_e) {
              return false;
            }
          });
          if (filteredByNftId.length === 0) {
            return false;
          }
        } catch (_e) {
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
          setPositionResolved(true);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return true;
        }
        return false;
      }

      // Fallback: if no expectedLegs provided, use first candidate after NFT ID filter (backward compatibility)
      const foundPosition = filteredByNftId[0];
      if (foundPosition) {
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
          // Error refetching positions
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

  // Absolute URL to the actual image route (for copying image binary)
  const absoluteImageUrl = useMemo(() => {
    if (typeof window !== 'undefined')
      return `${window.location.origin}${imageSrc}`;
    return imageSrc;
  }, [imageSrc]);

  // Canonical share page base; encoded short path becomes /s/<token>
  const shareHref = useMemo(() => `/share`, []);

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
              <PacmanEatingDots />
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
                  const payload = {
                    img: imageSrc,
                    title: shareTitle,
                    description: shareText,
                    alt: 'Sapience share image',
                  };
                  let shareUrl = shareHref;
                  try {
                    const resp = await fetch('/api/share/encode', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await resp.json();
                    shareUrl = data?.shareUrl || shareHref;
                  } catch {
                    // ignore and use fallback
                  }
                  await navigator.clipboard.writeText(shareUrl);
                  toast({ title: 'Link copied successfully' });
                } catch {
                  try {
                    const payload = {
                      img: imageSrc,
                      title: shareTitle,
                      description: shareText,
                      alt: 'Sapience share image',
                    };
                    let shareUrl = shareHref;
                    try {
                      const resp = await fetch('/api/share/encode', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      const data = await resp.json();
                      shareUrl = data?.shareUrl || shareHref;
                    } catch {
                      // ignore and use fallback
                    }
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
              onClick={async () => {
                // Request compact share URL from API
                const payload = {
                  // send relative path to shorten token further
                  img: imageSrc,
                  title: shareTitle,
                  description: shareText,
                  alt: 'Sapience share image',
                };
                try {
                  const res = await fetch('/api/share/encode', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  const shareUrl = data?.shareUrl || shareHref;
                  const intent = buildXShareUrl(shareUrl);
                  window.open(intent, '_blank', 'noopener,noreferrer');
                } catch {
                  const intent = buildXShareUrl(shareHref);
                  window.open(intent, '_blank', 'noopener,noreferrer');
                }
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
              onClick={async () => {
                const payload = {
                  img: imageSrc,
                  title: shareTitle,
                  description: shareText,
                  alt: 'Sapience share image',
                };
                let shareUrl = shareHref;
                try {
                  const res = await fetch('/api/share/encode', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  shareUrl = data?.shareUrl || shareHref;
                } catch {
                  // ignore; use fallback
                }
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
