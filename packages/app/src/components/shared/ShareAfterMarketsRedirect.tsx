'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import OgShareDialogBase from '~/components/shared/OgShareDialog';
import { useUserParlays, type Parlay } from '~/hooks/graphql/useUserParlays';

type Anchor = 'forecasts' | 'positions';

type ShareIntentStored = {
  address: string;
  anchor: Anchor;
  clientTimestamp: number;
  txHash?: string;
  og?: { imagePath: string; params?: Record<string, any> };
};

export default function ShareAfterMarketsRedirect() {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const clearedRef = useRef(false);
  const { address } = useAccount();

  const lowerAddress = address ? String(address).toLowerCase() : null;

  // Data hooks for fallback resolution
  const { data: positions, refetch: refetchPositions } = useUserParlays({
    address: lowerAddress || undefined,
  });

  // Wrapper to refetch positions data immediately
  const refetchPositionsWrapper = useCallback(() => {
    if (!lowerAddress) return;
    console.log('[ShareAfterMarketsRedirect] Refetching positions query for latest data');
    refetchPositions().catch((err) => {
      console.error('[ShareAfterMarketsRedirect] Error refetching positions:', err);
    });
  }, [lowerAddress, refetchPositions]);

  const clearIntent = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      console.log('[ShareAfterMarketsRedirect] Clearing share intent from sessionStorage');
      window.sessionStorage.removeItem('sapience:share-intent');
      clearedRef.current = true;
    } catch (e) {
      console.error('[ShareAfterMarketsRedirect] Error clearing intent:', e);
    }
  }, []);

  const readIntent = useCallback((): ShareIntentStored | null => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.sessionStorage.getItem('sapience:share-intent');
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as ShareIntentStored;
      console.log('[ShareAfterMarketsRedirect] Read share intent:', {
        address: parsed.address,
        anchor: parsed.anchor,
        hasOg: !!parsed.og,
        txHash: parsed.txHash,
        clientTimestamp: parsed.clientTimestamp,
      });
      return parsed || null;
    } catch (e) {
      console.error('[ShareAfterMarketsRedirect] Error reading intent:', e);
      return null;
    }
  }, []);

  // Build minimal OG url from resolved parlay
  const toOgUrl = useCallback(
    (entity: Parlay): string | null => {
      if (!lowerAddress) {
        return null;
      }
      const qp = new URLSearchParams();
      qp.set('addr', lowerAddress);
      try {
        // Encode all legs with question and prediction choice
        const position = entity;
        const legs = (position?.predictions || [])
          .map((o) => {
            const question =
              (o?.condition?.shortName as string) ||
              (o?.condition?.question as string);
            const choice = o?.outcomeYes ? 'Yes' : 'No';
            return question ? `${question}|${choice}` : null;
          })
          .filter(Boolean);
        if (legs.length > 0) {
          legs.forEach((l) => qp.append('leg', String(l)));
        }

        const collateralDecimals = 18;
        const collateralSymbol = 'testUSDe';
        if (position?.predictorCollateral) {
          const wager = parseFloat(
            formatUnits(
              BigInt(position.predictorCollateral),
              collateralDecimals
            )
          ).toFixed(2);
          qp.set('wager', wager);
        }

        if (position?.totalCollateral) {
          const totalCollateralBigInt = BigInt(position.totalCollateral);
          const payout = parseFloat(
            formatUnits(totalCollateralBigInt, collateralDecimals)
          ).toFixed(2);
          qp.set('payout', payout);
        }

        qp.set('symbol', collateralSymbol);

        const ogUrl = `/og/position?${qp.toString()}`;
        console.log('[ShareAfterMarketsRedirect] Built OG URL:', {
          url: ogUrl,
          legsCount: legs.length,
          hasWager: !!position?.predictorCollateral,
          hasPayout: !!position?.totalCollateral,
          positionId: position?.id,
        });
        return ogUrl;
      } catch (e) {
        console.error('[ShareAfterMarketsRedirect] Error building OG URL:', e);
        return null;
      }
    },
    [lowerAddress]
  );

  // // Main effect: attempt to resolve and show
  // useEffect(() => {
  //   console.log('[ShareAfterMarketsRedirect] useEffect triggered', {
  //     hasWindow: typeof window !== 'undefined',
  //     cleared: clearedRef.current,
  //     hasAddress: !!lowerAddress,
  //     positionsCount: positions?.length || 0,
  //   });
    
  //   if (typeof window === 'undefined') return;
  //   if (clearedRef.current) {
  //     console.log('[ShareAfterMarketsRedirect] Intent already cleared, skipping');
  //     return;
  //   }
  //   if (!lowerAddress) {
  //     console.log('[ShareAfterMarketsRedirect] Waiting for address to be available');
  //     return; // Wait for address to be available
  //   }

  //   const intent = readIntent();
  //   if (!intent) {
  //     console.log('[ShareAfterMarketsRedirect] No intent found in sessionStorage');
  //     return;
  //   }

  //   // Validate address and anchor
  //   const intentAddr = String(intent.address || '').toLowerCase();
  //   if (!intentAddr || intentAddr !== lowerAddress) {
  //     console.log('[ShareAfterMarketsRedirect] Address mismatch:', {
  //       intentAddr,
  //       lowerAddress,
  //     });
  //     return;
  //   }
  //   // Only handle positions anchor for markets page
  //   if (intent.anchor !== 'positions') {
  //     console.log('[ShareAfterMarketsRedirect] Anchor mismatch, expected positions, got:', intent.anchor);
  //     return;
  //   }

  //   console.log('[ShareAfterMarketsRedirect] Valid intent found, starting resolution');

  //   // Path 1: immediate OG provided by caller
  //   if (intent.og && intent.og.imagePath) {
  //     try {
  //       console.log('[ShareAfterMarketsRedirect] Using provided OG image path:', intent.og.imagePath);
  //       const params = new URLSearchParams(
  //         Object.fromEntries(
  //           Object.entries(intent.og.params || {})
  //             .filter(([, v]) => v !== undefined && v !== null)
  //             .map(([k, v]) => [k, String(v)])
  //         )
  //       );
  //       const src = `${intent.og.imagePath}?${params.toString()}`;
  //       console.log('[ShareAfterMarketsRedirect] Opening dialog with provided OG URL:', src);
  //       setImageSrc(src);
  //       setOpen(true);
  //       clearIntent();
  //       return;
  //     } catch (e) {
  //       console.error('[ShareAfterMarketsRedirect] Error using provided OG, falling through to resolution:', e);
  //       // fallthrough to resolution
  //     }
  //   }

  //   // Path 2: attempt to resolve via data hooks, up to 60s
  //   const start = Date.now();
  //   const windowMs = 2 * 60 * 1000; // 2 minutes
  //   const deadline = start + 60 * 1000; // give up after 60s
  //   console.log('[ShareAfterMarketsRedirect] Starting resolution timer, deadline:', new Date(deadline).toISOString());
    
  //   let checkCount = 0;
  //   const timer = setInterval(() => {
  //     checkCount++;
  //     const now = Date.now();
  //     if (now > deadline) {
  //       console.log('[ShareAfterMarketsRedirect] Resolution deadline reached after', checkCount, 'checks');
  //       clearInterval(timer);
  //       clearIntent();
  //       return;
  //     }

  //     const ts = Number(intent.clientTimestamp || 0);
  //     const minTs = ts - windowMs;

  //     // Refetch positions to ensure we have the latest data before resolving
  //     refetchPositionsWrapper();

  //     const list: Parlay[] = positions || [];
  //     const filtered = list.filter(
  //       (p: Parlay) => Number(p.mintedAt) * 1000 >= minTs
  //     );
      
  //     if (checkCount % 5 === 0) {
  //       console.log('[ShareAfterMarketsRedirect] Resolution check', checkCount, ':', {
  //         totalPositions: list.length,
  //         filteredCount: filtered.length,
  //         minTimestamp: new Date(minTs).toISOString(),
  //         intentTimestamp: new Date(ts).toISOString(),
  //       });
  //     }

  //     const resolved =
  //       filtered.sort(
  //         (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
  //       )[0] || null;

  //     if (resolved) {
  //       console.log('[ShareAfterMarketsRedirect] Parlay resolved:', {
  //         id: resolved.id,
  //         mintedAt: new Date(Number(resolved.mintedAt) * 1000).toISOString(),
  //         predictionsCount: resolved.predictions?.length || 0,
  //       });
  //       const src = toOgUrl(resolved);
  //       if (src) {
  //         console.log('[ShareAfterMarketsRedirect] Opening dialog with resolved parlay OG URL:', src);
  //         clearInterval(timer);
  //         setImageSrc(src);
  //         setOpen(true);
  //         clearIntent();
  //       } else {
  //         console.warn('[ShareAfterMarketsRedirect] Failed to build OG URL from resolved parlay');
  //       }
  //     }
  //   }, 1000);

  //   return () => clearInterval(timer);
  // }, [
  //   lowerAddress,
  //   positions,
  //   readIntent,
  //   toOgUrl,
  //   clearIntent,
  //   refetchPositionsWrapper,
  // ]);

  // Handle same-page navigation: when already on /markets and a new intent is written
  // This effect triggers the share dialog when intent is detected, even if we're already on the page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!lowerAddress) return;

    // Check for intent periodically when on the page
    // This handles the case where user submits parlay while already on /markets
    const checkInterval = setInterval(() => {
      // Skip if dialog is already open or intent was cleared
      if (clearedRef.current || open) return;
      
      const intent = readIntent();
      if (!intent) return;
      
      // Validate intent
      const intentAddr = String(intent.address || '').toLowerCase();
      if (intentAddr !== lowerAddress) return;
      if (intent.anchor !== 'positions') return;

      console.log('[ShareAfterMarketsRedirect] Periodic check found valid intent (same-page navigation), triggering resolution');

      // Path 1: immediate OG provided by caller
      if (intent.og && intent.og.imagePath) {
        try {
          console.log('[ShareAfterMarketsRedirect] Using provided OG image path from periodic check:', intent.og.imagePath);
          const params = new URLSearchParams(
            Object.fromEntries(
              Object.entries(intent.og.params || {})
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => [k, String(v)])
            )
          );
          const src = `${intent.og.imagePath}?${params.toString()}`;
          console.log('[ShareAfterMarketsRedirect] Opening dialog with provided OG URL from periodic check:', src);
          setImageSrc(src);
          setOpen(true);
          clearIntent();
          return;
        } catch (e) {
          console.error('[ShareAfterMarketsRedirect] Error using provided OG from periodic check:', e);
        }
      }
      console.log('[ShareAfterMarketsRedirect] Trying to resolve via positions data:', positions);
      // Path 2: attempt to resolve via positions data
      
      // Refetch positions to ensure we have the latest data before resolving
      refetchPositionsWrapper();
      
      const list: Parlay[] = positions || [];
      console.log('[ShareAfterMarketsRedirect] Positions data from periodic check:', list);
      if (list.length === 0) {
        // Positions not loaded yet, will try again on next check
        return;
      }

      const ts = Number(intent.clientTimestamp || 0);
      const windowMs = 2 * 60 * 1000; // 2 minutes
      const minTs = ts - windowMs;

      const filtered = list.filter(
        (p: Parlay) => Number(p.mintedAt) * 1000 >= minTs
      );

      const resolved =
        filtered.sort(
          (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
        )[0] || null;
      console.log('[ShareAfterMarketsRedirect] Resolved parlay from periodic check:', resolved);
      if (resolved) {
        console.log('[ShareAfterMarketsRedirect] Parlay resolved from periodic check:', {
          id: resolved.id,
          mintedAt: new Date(Number(resolved.mintedAt) * 1000).toISOString(),
          predictionsCount: resolved.predictions?.length || 0,
        });
        const src = toOgUrl(resolved);
        if (src) {
          console.log('[ShareAfterMarketsRedirect] Opening dialog with resolved parlay OG URL from periodic check:', src);
          setImageSrc(src);
          setOpen(true);
          clearIntent();
        } else {
          console.warn('[ShareAfterMarketsRedirect] Failed to build OG URL from resolved parlay in periodic check');
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [lowerAddress, positions, readIntent, toOgUrl, clearIntent, open, refetchPositionsWrapper]);

  useEffect(() => {
    if (open) {
      console.log('[ShareAfterMarketsRedirect] Share dialog opened with image:', imageSrc);
    } else if (imageSrc) {
      console.log('[ShareAfterMarketsRedirect] Share dialog closed');
      // Reset clearedRef when dialog closes so new intents can be processed
      clearedRef.current = false;
    }
  }, [open, imageSrc]);

  useEffect(() => {
    console.log('[ShareAfterMarketsRedirect] Component state:', {
      hasImageSrc: !!imageSrc,
      open,
      imageSrc,
    });
  }, [imageSrc, open]);

  if (!imageSrc) {
    console.log('[ShareAfterMarketsRedirect] No imageSrc, not rendering dialog');
    return null;
  }

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      open={open}
      onOpenChange={(newOpen) => {
        console.log('[ShareAfterMarketsRedirect] Dialog open state changed:', newOpen);
        setOpen(newOpen);
      }}
      title="Share"
      shareTitle="Share"
    />
  );
}

