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

  // Build OG url from NFT ID and market address (preferred method)
  const buildOgUrlFromNftAndMarket = useCallback(
    (nftTokenId: string, marketAddress: string): string | null => {
      try {
        const qp = new URLSearchParams();
        qp.set('nftId', String(nftTokenId));
        qp.set('marketAddress', String(marketAddress));
        const ogUrl = `/og/position?${qp.toString()}`;
        return ogUrl;
      } catch (e) {
        console.error(
          '[ShareAfterMarketsRedirect] Error building OG URL from NFT and market:',
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
  // Uses NFT ID and market address when available, otherwise falls back to query params
  const toOgUrl = useCallback(
    (entity: Parlay): string | null => {
      if (!lowerAddress) {
        return null;
      }
      try {
        const position = entity;

        // Prefer NFT ID and market address-based URL
        if (position?.predictorNftTokenId && position?.marketAddress) {
          return buildOgUrlFromNftAndMarket(
            position.predictorNftTokenId,
            position.marketAddress
          );
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
    [lowerAddress, buildOgUrlFromNftAndMarket]
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

      // Update intent with latest NFT ID if not already set (for tracking)
      // Prefer lastNftId from betslip data, otherwise get from positions
      // Also store in state when found
      if (!intent.lastNftId) {
        let nftIdToUse: string | undefined = intent.betslip?.lastNftId;

        // If found in betslip, store it in state immediately
        if (nftIdToUse) {
          setStoredLastNftId(nftIdToUse);
        }

        if (!nftIdToUse && positions && positions.length > 0) {
          // Get the highest NFT ID from current positions
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

        if (nftIdToUse) {
          const updatedIntent = {
            ...intent,
            lastNftId: nftIdToUse,
          };
          try {
            window.sessionStorage.setItem(
              'sapience:share-intent',
              JSON.stringify(updatedIntent)
            );
            // Store in state so it persists after intent is cleared
            setStoredLastNftId(nftIdToUse);
            // Update local intent reference for this check cycle
            Object.assign(intent, updatedIntent);
          } catch (e) {
            console.error(
              '[ShareAfterMarketsRedirect] Error updating intent with NFT ID:',
              e
            );
          }
        }
      }

      // Path 1: immediate OG provided by caller
      if (intent.og && intent.og.imagePath) {
        // Store expected legs in state if available in betslip
        if (intent.betslip?.legs) {
          setStoredExpectedLegs(intent.betslip.legs);
        }
        if (intent.txHash) {
          setStoredTxHash(intent.txHash);
        }
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
          return;
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Error using provided OG:',
            e
          );
        }
      }

      // Path 2: Wait for position to be indexed, then use positionId
      refetchPositionsWrapper();

      const list: Parlay[] = positions || [];
      const ts = Number(intent.clientTimestamp || 0);
      const windowMs = 2 * 60 * 1000; // 2 minutes
      const minTs = ts - windowMs;

      // Find positions minted after the intent timestamp
      const candidatePositions = list.filter(
        (p: Parlay) => Number(p.mintedAt) * 1000 >= minTs
      );

      // Filter by NFT ID if lastNftId is provided
      let filteredByNftId = candidatePositions;
      const lastNftIdToCheck = intent.lastNftId || intent.betslip?.lastNftId;
      if (lastNftIdToCheck && candidatePositions.length > 0) {
        try {
          const lastNftIdBigInt = BigInt(lastNftIdToCheck);
          filteredByNftId = candidatePositions.filter((p: Parlay) => {
            try {
              const currentNftId = BigInt(p.predictorNftTokenId || '0');
              return currentNftId > lastNftIdBigInt;
            } catch {
              return false;
            }
          });
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Error comparing NFT IDs:',
            e
          );
          // Error comparing NFT IDs, use all candidates
        }
      }

      // If expectedLegs are provided, verify the position matches
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

            for (const leg of intent.betslip!.legs) {
              const key = `${leg.question}|${leg.choice}`;
              if (!positionMap.has(key)) {
                return false;
              }
            }

            for (const leg of positionLegs) {
              const key = `${leg.question}|${leg.choice}`;
              if (!expectedMap.has(key)) {
                return false;
              }
            }

            return true;
          }) || null;
      } else {
        // Fallback: use first candidate after NFT ID filter
        resolved =
          filteredByNftId.sort(
            (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
          )[0] || null;
      }

      if (resolved) {
        // Use NFT ID and market address to build OG URL (preferred method)
        if (resolved.predictorNftTokenId && resolved.marketAddress) {
          const src = buildOgUrlFromNftAndMarket(
            resolved.predictorNftTokenId,
            resolved.marketAddress
          );
          if (src) {
            setImageSrc(src);
            setOpen(true);
            clearIntent();
            return;
          }
        }

        // Fallback to old method if positionId method fails
        const fallbackSrc = toOgUrl(resolved);
        if (fallbackSrc) {
          setImageSrc(fallbackSrc);
          setOpen(true);
          clearIntent();
        }
        return;
      }

      // Path 3: If position not found yet, wait for indexing
      // Don't open dialog optimistically - wait for position to be indexed
      if (list.length === 0) {
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
    buildOgUrlFromNftAndMarket,
    buildOgUrlFromBetslip,
    toOgUrl,
    clearIntent,
    open,
    refetchPositionsWrapper,
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

  const lastNftId = useMemo(() => {
    if (!imageSrc) return undefined;
    // First try to read from intent, then fall back to stored state
    const intent = readIntent();
    const intentNftId = intent?.lastNftId;
    if (intentNftId) {
      // Update state if we found it in intent
      if (intentNftId !== storedLastNftId) {
        setStoredLastNftId(intentNftId);
      }
      return intentNftId;
    }
    // Fall back to stored state (persists after intent is cleared)
    return storedLastNftId;
  }, [imageSrc, readIntent, storedLastNftId]);

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
