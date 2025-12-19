'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  lastNftId?: string; // Last NFT ID from positions before this parlay was submitted
  og?: {
    imagePath: string;
    params?: Record<string, string | number | boolean | null | undefined>;
  };
  betslip?: {
    legs: Array<{ question: string; choice: 'Yes' | 'No' }>;
    wager: string;
    payout?: string;
    symbol: string;
    lastNftId?: string; // Last NFT ID before this parlay was submitted
  };
};

export default function ShareAfterMarketsRedirect() {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [storedLastNftId, setStoredLastNftId] = useState<string | undefined>(
    undefined
  );
  const [storedTxHash, setStoredTxHash] = useState<string | undefined>(
    undefined
  );
  const [storedExpectedLegs, setStoredExpectedLegs] = useState<
    Array<{ question: string; choice: 'Yes' | 'No' }> | undefined
  >(undefined);
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
    refetchPositions().catch((err) => {
      console.error(
        '[ShareAfterMarketsRedirect] Error refetching positions:',
        err
      );
    });
  }, [lowerAddress, refetchPositions]);

  const clearIntent = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
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
      return parsed || null;
    } catch (e) {
      console.error('[ShareAfterMarketsRedirect] Error reading intent:', e);
      return null;
    }
  }, []);

  // Build OG url from position ID (preferred method)
  const buildOgUrlFromPositionId = useCallback(
    (positionId: number, chainId?: number): string | null => {
      try {
        const qp = new URLSearchParams();
        qp.set('positionId', String(positionId));
        if (chainId) {
          qp.set('chainId', String(chainId));
        }
        const ogUrl = `/og/position?${qp.toString()}`;
        return ogUrl;
      } catch (e) {
        console.error(
          '[ShareAfterMarketsRedirect] Error building OG URL from positionId:',
          e
        );
        return null;
      }
    },
    []
  );

  // Build OG url from betslip data (fallback)
  const buildOgUrlFromBetslip = useCallback(
    (betslip: ShareIntentStored['betslip']): string | null => {
      if (!lowerAddress || !betslip) {
        return null;
      }
      try {
        const qp = new URLSearchParams();
        qp.set('addr', lowerAddress);

        // Add legs
        if (betslip.legs && betslip.legs.length > 0) {
          betslip.legs.forEach((leg) => {
            if (leg.question) {
              qp.append('leg', `${leg.question}|${leg.choice}`);
            }
          });
        }

        // Add wager
        if (betslip.wager) {
          qp.set('wager', betslip.wager);
        }

        // Add payout
        if (betslip.payout) {
          qp.set('payout', betslip.payout);
        }

        // Add symbol
        if (betslip.symbol) {
          qp.set('symbol', betslip.symbol);
        }

        const ogUrl = `/og/position?${qp.toString()}`;
        return ogUrl;
      } catch (e) {
        console.error(
          '[ShareAfterMarketsRedirect] Error building OG URL from betslip:',
          e
        );
        return null;
      }
    },
    [lowerAddress]
  );

  // Build minimal OG url from resolved parlay (fallback)
  // Uses positionId when available, otherwise falls back to query params
  const toOgUrl = useCallback(
    (entity: Parlay): string | null => {
      if (!lowerAddress) {
        return null;
      }
      try {
        const position = entity;

        // Prefer positionId-based URL (same as buildOgUrlFromPositionId)
        if (position?.id) {
          return buildOgUrlFromPositionId(position.id, position.chainId);
        }

        // Fallback to query params if positionId is not available
        const qp = new URLSearchParams();
        qp.set('addr', lowerAddress);

        // Encode all legs with question and prediction choice
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
        return ogUrl;
      } catch (e) {
        console.error('[ShareAfterMarketsRedirect] Error building OG URL:', e);
        return null;
      }
    },
    [lowerAddress, buildOgUrlFromPositionId]
  );

  // Handle intent detection and open dialog with betslip data
  // Uses periodic check to detect intents written while already on the page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!lowerAddress) return;

    const checkAndOpenDialog = () => {
      // Skip if intent was cleared
      if (clearedRef.current) return;

      const intent = readIntent();
      if (!intent) {
        // If no intent but dialog is open, close it to reset state
        if (open) {
          setOpen(false);
          setImageSrc(null);
        }
        return;
      }

      // Validate intent
      const intentAddr = String(intent.address || '').toLowerCase();
      if (intentAddr !== lowerAddress) return;
      if (intent.anchor !== 'positions') return;

      // If dialog is already open, close it first to reset state for new intent
      // This handles the case where multiple parlays are created without refresh
      if (open) {
        setOpen(false);
        setImageSrc(null);
        setStoredLastNftId(undefined); // Reset stored NFT ID for new intent
        setStoredExpectedLegs(undefined); // Reset stored expected legs for new intent
        clearedRef.current = false;
        return; // Will process new intent on next check cycle
      }

      // Update intent with latest NFT ID for tracking
      // Strategy: Always update lastNftId when processing a new intent to handle multiple submissions
      // Prefer lastNftId from betslip data (captured at submission time), otherwise use stored state or calculate from positions
      let nftIdToUse: string | undefined = intent.betslip?.lastNftId || intent.lastNftId;

      // If found in betslip, use it (this is the most accurate - captured at submission time)
      if (intent.betslip?.lastNftId) {
        nftIdToUse = intent.betslip.lastNftId;
      } else if (intent.lastNftId) {
        // Use from intent if available
        nftIdToUse = intent.lastNftId;
      } else if (storedLastNftId) {
        // Use stored state (from previous bid)
        nftIdToUse = storedLastNftId;
      } else if (positions && positions.length > 0) {
        // Calculate from current positions (fallback - should be rare)
        const latestPosition = positions.reduce((latest, current) => {
          try {
            const latestNftId = BigInt(latest.predictorNftTokenId || '0');
            const currentNftId = BigInt(current.predictorNftTokenId || '0');
            return currentNftId > latestNftId ? current : latest;
          } catch {
            return latest;
          }
        }, positions[0]);

        if (latestPosition && latestPosition.predictorNftTokenId) {
          nftIdToUse = latestPosition.predictorNftTokenId;
        }
      }

      // Always update intent and state with the determined lastNftId (handles multiple submissions)
      if (nftIdToUse) {
        // Only update if it's different from what's in the intent
        if (intent.lastNftId !== nftIdToUse) {
          const updatedIntent = {
            ...intent,
            lastNftId: nftIdToUse,
          };
          try {
            window.sessionStorage.setItem(
              'sapience:share-intent',
              JSON.stringify(updatedIntent)
            );
            // Update local intent reference for this check cycle
            Object.assign(intent, updatedIntent);
          } catch (e) {
            console.error(
              '[ShareAfterMarketsRedirect] Error updating intent with NFT ID:',
              e
            );
          }
        }
        // Always update stored state (even if intent already had it) to track latest across multiple submissions
        if (storedLastNftId !== nftIdToUse) {
          setStoredLastNftId(nftIdToUse);
        }
      } else {
        console.warn('[ShareAfterMarketsRedirect] Position indexing: No lastNftId determined - position tracking may be less accurate');
      }

      // Store expected legs, txHash, and lastNftId in state before clearing intent
      if (intent.betslip?.legs && intent.betslip.legs.length > 0) {
        setStoredExpectedLegs(intent.betslip.legs);
      }
      if (intent.txHash) {
        setStoredTxHash(intent.txHash);
      }

      // Path 1: immediate OG provided by caller - open dialog immediately
      if (intent.og && intent.og.imagePath) {
        try {
          const params = new URLSearchParams(
            Object.fromEntries(
              Object.entries(intent.og.params || {})
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => [k, String(v)])
            )
          );
          const src = `${intent.og.imagePath}?${params.toString()}`;
          setImageSrc(src);
          setOpen(true);
          clearIntent();
          // Start tracking position in background (OgShareDialog will handle this)
          refetchPositionsWrapper();
          return;
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Error using provided OG:',
            e
          );
        }
      }

      // Path 2: Open dialog immediately with betslip data, then track for position
      // First, try to find the position immediately (it might already be indexed)
      refetchPositionsWrapper();
      
      const list: Parlay[] = positions || [];
      const ts = Number(intent.clientTimestamp || 0);
      const windowMs = 2 * 60 * 1000; // 2 minutes
      const minTs = ts - windowMs;
      const lastNftIdToCheck = intent.lastNftId || intent.betslip?.lastNftId || storedLastNftId;

      // Find positions minted after the intent timestamp
      const candidatePositions = list.filter((p: Parlay) => {
        const mintedAtMs = Number(p.mintedAt) * 1000;
        const passes = mintedAtMs >= minTs;
        return passes;
      });

      // Filter by NFT ID if lastNftId is provided
      let filteredByNftId = candidatePositions;
      if (lastNftIdToCheck && candidatePositions.length > 0) {
        try {
          const lastNftIdBigInt = BigInt(lastNftIdToCheck);
          filteredByNftId = candidatePositions.filter((p: Parlay) => {
            try {
              const currentNftId = BigInt(p.predictorNftTokenId || '0');
              return currentNftId > lastNftIdBigInt;
            } catch (err) {
              console.error('[ShareAfterMarketsRedirect] Position indexing: Error comparing NFT ID for position', {
                positionId: p.id,
                nftId: p.predictorNftTokenId,
                error: err,
              });
              return false;
            }
          });
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Position indexing: Error comparing NFT IDs:',
            e
          );
          // Error comparing NFT IDs, use all candidates
        }
      }

      // Try to find the position immediately
      let resolved: Parlay | null = null;
      if (intent.betslip?.legs && intent.betslip.legs.length > 0) {
        resolved =
          filteredByNftId.find((p: Parlay) => {
            const positionLegs = (p.predictions || []).map((pred) => {
              const question =
                pred.condition?.shortName || pred.condition?.question || '';
              const choice = pred.outcomeYes ? 'Yes' : 'No';
              return { question, choice };
            });

            if (positionLegs.length !== intent.betslip!.legs.length) {
              return false;
            }

            const expectedMap = new Map(
              intent.betslip!.legs.map((leg) => [
                `${leg.question}|${leg.choice}`,
                true,
              ])
            );
            const positionMap = new Map(
              positionLegs.map((leg) => [`${leg.question}|${leg.choice}`, true])
            );

            // Check if all expected legs are present in position
            for (const leg of intent.betslip!.legs) {
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
          }) || null;

        if (!resolved) {
          console.warn('[ShareAfterMarketsRedirect] Position indexing: No position matched expected legs', {
            expectedLegs: intent.betslip.legs,
            checkedPositions: filteredByNftId.map((p) => ({
              id: p.id,
              legs: (p.predictions || []).map((pred) => ({
                question: pred.condition?.shortName || pred.condition?.question,
                choice: pred.outcomeYes ? 'Yes' : 'No',
              })),
            })),
          });
        }
      } else {
        // Fallback: use first candidate after NFT ID filter
        console.warn('[ShareAfterMarketsRedirect] Position indexing: Using fallback (no expected legs) - this should be avoided!', {
          candidates: filteredByNftId.length,
          candidateIds: filteredByNftId.map((p) => p.id),
          hasBetslip: !!intent.betslip,
          hasLegs: !!(intent.betslip?.legs && intent.betslip.legs.length > 0),
        });
        resolved =
          filteredByNftId.sort(
            (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
          )[0] || null;
      }

      // Build OG URL from betslip data to show immediately
      const betslipOgUrl = buildOgUrlFromBetslip(intent.betslip);
      if (betslipOgUrl) {
        // If position was found immediately, use positionId-based URL (better)
        if (resolved) {
          const src = buildOgUrlFromPositionId(resolved.id, resolved.chainId);
          if (src) {
            setImageSrc(src);
            setOpen(true);
            clearIntent();
            return;
          }
        }
        
        // Otherwise, open dialog immediately with betslip-based OG image
        setImageSrc(betslipOgUrl);
        setOpen(true);
        clearIntent();
        // OgShareDialog will continue tracking for the position and update when found
        return;
      }

      // Path 3: If no betslip data, wait for position to be indexed first before opening

      // If position is found, update the imageSrc to use positionId (better than betslip data)
      if (resolved) {
        // Use positionId to build OG URL (preferred method)
        const src = buildOgUrlFromPositionId(resolved.id, resolved.chainId);
        if (src) {
          // Update imageSrc if dialog is already open, or open it if not
          setImageSrc(src);
          if (!open) {
            setOpen(true);
          }
          clearIntent();
          return;
        }

        // Fallback to old method if positionId method fails
        const fallbackSrc = toOgUrl(resolved);
        if (fallbackSrc) {
          setImageSrc(fallbackSrc);
          if (!open) {
            setOpen(true);
          }
          clearIntent();
        }
        return;
      }

      // If position not found yet and dialog is not open, wait for indexing
      // (If dialog is already open, OgShareDialog will handle tracking)
      if (!open && list.length === 0) {
        // Will retry when positions load
        return;
      }
    };

    // Check immediately
    checkAndOpenDialog();

    // Also check periodically to catch intents written while already on the page
    const checkInterval = setInterval(() => {
      checkAndOpenDialog();
    }, 500); // Check every 500ms

    return () => clearInterval(checkInterval);
  }, [
    lowerAddress,
    positions,
    readIntent,
    buildOgUrlFromPositionId,
    buildOgUrlFromBetslip,
    toOgUrl,
    clearIntent,
    open,
    refetchPositionsWrapper,
    storedLastNftId,
  ]);

  useEffect(() => {
    if (!open) {
      // Reset clearedRef when dialog closes so new intents can be processed
      if (clearedRef.current) {
        clearedRef.current = false;
      }
      // Clear imageSrc when dialog closes to allow new intents to be processed
      if (imageSrc) {
        setImageSrc(null);
      }
    }
  }, [open, imageSrc]);

  // Get position timestamp and expected legs from intent for tracking (must be before conditional return)
  const positionTimestamp = useMemo(() => {
    if (!imageSrc) return undefined;
    const intent = readIntent();
    return intent?.clientTimestamp ? intent.clientTimestamp : undefined;
  }, [imageSrc, readIntent]);

  const txHash = useMemo(() => {
    if (!imageSrc) return undefined;
    const intent = readIntent();
    const intentTx = intent?.txHash;
    if (intentTx) {
      if (intentTx !== storedTxHash) setStoredTxHash(intentTx);
      return intentTx;
    }
    return storedTxHash;
  }, [imageSrc, readIntent, storedTxHash]);

  const expectedLegs = useMemo(() => {
    if (!imageSrc) return undefined;
    // First try to read from intent, then fall back to stored state
    const intent = readIntent();
    const intentLegs = intent?.betslip?.legs;
    if (intentLegs) {
      // Update state if we found it in intent
      if (JSON.stringify(intentLegs) !== JSON.stringify(storedExpectedLegs)) {
        setStoredExpectedLegs(intentLegs);
      }
      return intentLegs;
    }
    // Fall back to stored state (persists after intent is cleared)
    return storedExpectedLegs;
  }, [imageSrc, readIntent, storedExpectedLegs]);

  // Extract intent values for dependency array
  const intent = readIntent();
  const intentLastNftId = intent?.lastNftId;

  const lastNftId = useMemo(() => {
    if (!imageSrc) {
      return undefined;
    }
    // First try to read from intent, then fall back to stored state
    const intentNftId = intentLastNftId;

    if (intentNftId) {
      // Update state if we found it in intent and it's greater than stored (or stored is undefined)
      if (!storedLastNftId || BigInt(intentNftId) > BigInt(storedLastNftId)) {
        setStoredLastNftId(intentNftId);
      }
      return intentNftId;
    }
    
    // Fall back to stored state (persists after intent is cleared)
    return storedLastNftId;
  }, [imageSrc, intentLastNftId, storedLastNftId]);

  if (!imageSrc) {
    return null;
  }

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
      }}
      title="Share"
      shareTitle="Share"
      trackPosition={true}
      txHash={txHash}
      positionTimestamp={positionTimestamp}
      expectedLegs={expectedLegs}
      lastNftId={lastNftId}
    />
  );
}
