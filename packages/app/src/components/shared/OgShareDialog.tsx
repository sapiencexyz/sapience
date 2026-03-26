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
import { useToast } from '@sapience/ui/hooks/use-toast';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PositionProgressBar from '~/components/shared/PositionProgressBar';
import { usePredictions, type Prediction } from '~/hooks/graphql/usePositions';
import { useSession } from '~/lib/context/SessionContext';
import type { PositionProgressState } from '~/types/positionProgress';

// Stable counter for cache busting - increments each time a dialog opens
let dialogOpenCounter = 0;

interface OgShareDialogBaseProps {
  imageSrc: string; // Relative path with query, e.g. "/og/prediction?..."
  title?: string; // Dialog title
  trigger?: React.ReactNode;
  shareTitle?: string; // Unused but kept for backward compatibility
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trackPosition?: boolean; // Enable position tracking
  positionTimestamp?: number; // Timestamp when position was placed (ms)
  progressState?: PositionProgressState; // Progress state for showing submission stages
  onPositionIndexed?: () => void; // Called when position is found in GraphQL
  shareUrl?: string; // Override share URL (e.g. for slip preview cards)
  forecastUid?: string; // For forecast share URLs (/forecast/{uid})
  trackPrediction?: boolean; // Enable prediction tracking
  predictionTimestamp?: number; // Timestamp when prediction was submitted (ms)
  onPredictionIndexed?: () => void; // Called when prediction is found
  expectedPicks?: Array<{ conditionId: string; predictedOutcome: number }>; // Expected picks to match against
}

export default function OgShareDialogBase({
  imageSrc,
  title = 'Trade Submitted',
  trigger,
  open: controlledOpen,
  onOpenChange,
  trackPosition = false,
  positionTimestamp,
  progressState,
  onPositionIndexed: _onPositionIndexed,
  shareUrl: shareUrlProp,
  forecastUid,
  trackPrediction = false,
  predictionTimestamp,
  onPredictionIndexed,
  expectedPicks,
}: OgShareDialogBaseProps) {
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
  const { effectiveAddress } = useSession();
  const [positionResolved, setPositionResolved] = useState(false);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCancelledRef = useRef(false);
  const dialogOpenTimestampRef = useRef<number | null>(null);

  // Store resolved predictionId for prediction tracking
  const [resolvedPredictionId, setResolvedPredictionId] = useState<
    string | null
  >(null);
  const predictionPollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const predictionPollingCancelledRef = useRef(false);
  const predictionOpenTimestampRef = useRef<number | null>(null);

  // Use effectiveAddress from session context for position tracking
  const userAddress = effectiveAddress?.toLowerCase();

  // Fetch predictions for tracking
  const { data: predictions, refetch: refetchPredictions } = usePredictions({
    address: trackPrediction && userAddress ? userAddress : undefined,
    take: 5,
  });

  // Prediction tracking logic
  useEffect(() => {
    if (!trackPrediction || !open || !userAddress) {
      return;
    }
    if (resolvedPredictionId) {
      predictionPollingCancelledRef.current = true;
      if (predictionPollingTimerRef.current) {
        clearTimeout(predictionPollingTimerRef.current);
        predictionPollingTimerRef.current = null;
      }
      return;
    }

    const minTimestamp = predictionOpenTimestampRef.current || Date.now();

    const checkPredictions = (
      preds: Prediction[],
      _source: string
    ): boolean => {
      if (!preds || preds.length === 0) {
        return false;
      }
      const found = preds.find((p) => {
        const createdAtMs = new Date(p.createdAt).getTime();
        if (createdAtMs < minTimestamp - 10_000) return false; // 10s buffer for clock skew

        // If expected picks are provided, verify the prediction's picks match
        if (expectedPicks && expectedPicks.length > 0) {
          const predPicks = p.pickConfig?.picks;
          if (!predPicks || predPicks.length !== expectedPicks.length)
            return false;
          const predPickSet = new Set(
            predPicks.map((pk) => `${pk.conditionId}:${pk.predictedOutcome}`)
          );
          const allMatch = expectedPicks.every((ep) =>
            predPickSet.has(`${ep.conditionId}:${ep.predictedOutcome}`)
          );
          if (!allMatch) return false;
        }

        return true;
      });
      if (found) {
        setResolvedPredictionId(found.predictionId);
        onPredictionIndexed?.();
        setPositionResolved(true); // reuse positionResolved to show buttons
        predictionPollingCancelledRef.current = true;
        if (predictionPollingTimerRef.current) {
          clearTimeout(predictionPollingTimerRef.current);
          predictionPollingTimerRef.current = null;
        }
        return true;
      }
      return false;
    };

    if (predictions.length > 0) {
      checkPredictions(predictions, 'cached');
    }

    predictionPollingCancelledRef.current = false;
    const poll = async () => {
      if (predictionPollingCancelledRef.current) return;
      try {
        const result = await refetchPredictions();
        const latest = result.data || [];
        if (!predictionPollingCancelledRef.current) {
          checkPredictions(latest, 'poll');
        }
      } catch (err) {
        console.warn('[OgShareDialog] prediction refetch threw', err);
      }
      if (!predictionPollingCancelledRef.current) {
        predictionPollingTimerRef.current = setTimeout(poll, 500);
      }
    };
    predictionPollingTimerRef.current = setTimeout(poll, 500);

    return () => {
      predictionPollingCancelledRef.current = true;
      if (predictionPollingTimerRef.current) {
        clearTimeout(predictionPollingTimerRef.current);
        predictionPollingTimerRef.current = null;
      }
    };
  }, [
    trackPrediction,
    open,
    userAddress,
    resolvedPredictionId,
    predictions,
    refetchPredictions,
    onPredictionIndexed,
    expectedPicks,
  ]);

  // Reset tracking state when dialog closes
  useEffect(() => {
    if (!open) {
      setPositionResolved(false);
      setResolvedPredictionId(null); // Reset resolved prediction data
      setImgLoading(true); // Reset image loading state to prevent flash on reopen
      dialogOpenTimestampRef.current = null;
      predictionOpenTimestampRef.current = null;
      pollingCancelledRef.current = true;
      predictionPollingCancelledRef.current = true;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      if (predictionPollingTimerRef.current) {
        clearTimeout(predictionPollingTimerRef.current);
        predictionPollingTimerRef.current = null;
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

  const buildShareUrl = useCallback((): string => {
    if (shareUrlProp) return shareUrlProp;

    // Use prediction URL when resolved
    if (resolvedPredictionId) {
      const relativeUrl = `/predictions/${resolvedPredictionId}`;
      if (typeof window === 'undefined') return relativeUrl;
      return `${window.location.origin}${relativeUrl}`;
    }

    let relativeUrl = '/';
    if (forecastUid) {
      relativeUrl = `/forecast/${forecastUid}`;
    }

    if (typeof window === 'undefined') {
      return relativeUrl;
    }
    return `${window.location.origin}${relativeUrl}`;
  }, [shareUrlProp, resolvedPredictionId, forecastUid]);

  // Always use the original imageSrc (query-param card). The share URL already
  // updates to /predictions/{id} when the prediction resolves, so social media
  // crawlers get the API-dependent OG image from the prediction page's meta tags.
  const effectiveImageSrc = imageSrc;

  // Absolute URL to the actual image route (for copying image binary)
  const absoluteImageUrl = useMemo(() => {
    if (typeof window !== 'undefined')
      return `${window.location.origin}${effectiveImageSrc}`;
    return effectiveImageSrc;
  }, [effectiveImageSrc]);

  // Set dialogOpenTimestamp when dialog opens for position tracking
  useEffect(() => {
    if (open && trackPosition && !dialogOpenTimestampRef.current) {
      dialogOpenTimestampRef.current = positionTimestamp || Date.now();
    }
  }, [open, trackPosition, positionTimestamp]);

  // Set predictionOpenTimestamp when dialog opens for prediction tracking
  useEffect(() => {
    if (open && trackPrediction && !predictionOpenTimestampRef.current) {
      predictionOpenTimestampRef.current = predictionTimestamp || Date.now();
    }
  }, [open, trackPrediction, predictionTimestamp]);

  const previewSrc = `${effectiveImageSrc}${cacheBust ? `&cb=${cacheBust}` : ''}`;

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
            {!trackPosition && !trackPrediction && imgLoading && (
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
            {(trackPosition || trackPrediction) && progressState && (
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${
                  positionResolved
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100'
                }`}
              >
                <PositionProgressBar
                  progressState={progressState}
                  userAddress={userAddress}
                />
              </div>
            )}
            {/* Buttons - fade in on top of progress bar when resolved */}
            <div
              className={`absolute inset-0 flex items-center transition-opacity duration-500 ease-out ${
                (trackPosition || trackPrediction) && !positionResolved
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100'
              }`}
            >
              <div
                className={`grid gap-4 w-full ${
                  (trackPosition || trackPrediction) && userAddress
                    ? 'grid-cols-4'
                    : 'grid-cols-3'
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
                        typeof ClipboardItem !== 'undefined'
                      ) {
                        const item = new ClipboardItem({
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
                    if (navigator.share) {
                      try {
                        await navigator.share({ url: shareUrl });
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
                {(trackPosition || trackPrediction) && userAddress && (
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
