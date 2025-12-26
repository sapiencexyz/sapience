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
  const [storedClientTimestamp, setStoredClientTimestamp] = useState<
    number | undefined
  >(undefined);
  const [storedTxHash, setStoredTxHash] = useState<string | undefined>(
    undefined
  );
  const [storedExpectedLegs, setStoredExpectedLegs] = useState<
    Array<{ question: string; choice: 'Yes' | 'No' }> | undefined
  >(undefined);
  const clearedRef = useRef(false);
  const openRef = useRef(false);
  const imageSrcRef = useRef<string | null>(null);
  const storedLastNftIdRef = useRef<string | undefined>(undefined);
  const positionsRef = useRef<Parlay[]>([]);
  const { address } = useAccount();

  const lowerAddress = address ? String(address).toLowerCase() : null;

  // Data hooks for position resolution
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

  // Build OG url from NFT ID and market address with position data
  const buildOgUrlFromNftAndMarket = useCallback(
    (
      nftTokenId: string,
      marketAddress: string,
      position: Parlay
    ): string | null => {
      try {
        const qp = new URLSearchParams();
        qp.set('nftId', String(nftTokenId));
        qp.set('marketAddress', String(marketAddress));

        // Add address
        if (position.predictor) {
          qp.set('addr', position.predictor.toLowerCase());
        }

        // Add wager (predictorCollateral)
        const collateralDecimals = 18;
        if (position.predictorCollateral) {
          const wager = parseFloat(
            formatUnits(
              BigInt(position.predictorCollateral),
              collateralDecimals
            )
          ).toFixed(2);
          qp.set('wager', wager);
        }

        // Add payout (totalCollateral)
        if (position.totalCollateral) {
          const payout = parseFloat(
            formatUnits(BigInt(position.totalCollateral), collateralDecimals)
          ).toFixed(2);
          qp.set('payout', payout);
        }

        // Add symbol (default to testUSDe)
        qp.set('symbol', 'testUSDe');

        // Add legs from predictions
        if (position.predictions && position.predictions.length > 0) {
          position.predictions.forEach((pred) => {
            const question =
              pred.condition?.shortName || pred.condition?.question || '';
            if (question) {
              const choice = pred.outcomeYes ? 'Yes' : 'No';
              qp.append('leg', `${question}|${choice}`);
            }
          });
        }

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

  // Check if position is indexed and update imageSrc if found
  const checkAndUpdatePosition = useCallback(
    (
      intent: ShareIntentStored,
      positionsList: Parlay[],
      lastNftIdToCheck: string
    ): Parlay | null => {
      if (!intent.betslip?.legs || intent.betslip.legs.length === 0) {
        return null;
      }

      const ts = Number(intent.clientTimestamp || 0);
      const windowMs = 2 * 60 * 1000; // 2 minutes
      const minTs = ts - windowMs;

      // Find positions minted after the intent timestamp
      const candidatePositions = positionsList.filter((p: Parlay) => {
        const mintedAtMs = Number(p.mintedAt) * 1000;
        const passes = mintedAtMs >= minTs;
        return passes;
      });

      // Filter by NFT ID
      let filteredByNftId: Parlay[] = [];
      try {
        const lastNftIdBigInt = BigInt(lastNftIdToCheck);
        filteredByNftId = candidatePositions.filter((p: Parlay) => {
          try {
            const currentNftId = BigInt(p.predictorNftTokenId || '0');
            return currentNftId > lastNftIdBigInt;
          } catch (err) {
            console.error(
              '[ShareAfterMarketsRedirect] Position indexing: Error comparing NFT ID for position',
              {
                positionId: p.id,
                nftId: p.predictorNftTokenId,
                error: err,
              }
            );
            return false;
          }
        });
      } catch (e) {
        console.error(
          '[ShareAfterMarketsRedirect] Position indexing: Error comparing NFT IDs:',
          e
        );
        return null;
      }

      // Find the position using expected legs
      const resolved = filteredByNftId.find((p: Parlay) => {
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
      });

      return resolved || null;
    },
    []
  );

  // Handle intent detection and open dialog when position is indexed
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
        if (openRef.current) {
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
      if (openRef.current) {
        setOpen(false);
        setImageSrc(null);
        setStoredLastNftId(undefined); // Reset stored NFT ID for new intent
        clearedRef.current = false;
        return; // Will process new intent on next check cycle
      }

      // Get lastNftId from intent (required)
      const nftIdToUse = intent.betslip?.lastNftId || intent.lastNftId;
      if (!nftIdToUse) {
        // Cannot proceed without lastNftId
        return;
      }

      // Update intent and state with lastNftId
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
          Object.assign(intent, updatedIntent);
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Error updating intent with NFT ID:',
            e
          );
        }
      }

      if (storedLastNftIdRef.current !== nftIdToUse) {
        setStoredLastNftId(nftIdToUse);
        storedLastNftIdRef.current = nftIdToUse;
      }

      // Store all intent data in state before clearing
      if (intent.clientTimestamp) {
        setStoredClientTimestamp(intent.clientTimestamp);
      }
      if (intent.txHash) {
        setStoredTxHash(intent.txHash);
      }
      if (intent.betslip?.legs && intent.betslip.legs.length > 0) {
        setStoredExpectedLegs(intent.betslip.legs);
      }

      // Open dialog immediately with OG URL built from intent
      if (!imageSrcRef.current && intent.betslip && lowerAddress) {
        try {
          const qp = new URLSearchParams();
          qp.set('addr', lowerAddress);

          // Add legs
          if (intent.betslip.legs && intent.betslip.legs.length > 0) {
            intent.betslip.legs.forEach((leg) => {
              if (leg.question) {
                qp.append('leg', `${leg.question}|${leg.choice}`);
              }
            });
          }

          // Add wager
          if (intent.betslip.wager) {
            qp.set('wager', intent.betslip.wager);
          }

          // Add payout
          if (intent.betslip.payout) {
            qp.set('payout', intent.betslip.payout);
          }

          // Add symbol
          if (intent.betslip.symbol) {
            qp.set('symbol', intent.betslip.symbol);
          }

          const ogUrl = `/og/position?${qp.toString()}`;
          setImageSrc(ogUrl);
          setOpen(true);
          clearIntent();
          refetchPositionsWrapper();
        } catch (e) {
          console.error(
            '[ShareAfterMarketsRedirect] Error building OG URL from intent:',
            e
          );
        }
      }
    };

    // Check immediately
    checkAndOpenDialog();

    // Also check periodically to catch intents written while already on the page
    const checkInterval = setInterval(() => {
      checkAndOpenDialog();
    }, 500); // Check every 500ms
    return () => clearInterval(checkInterval);
  }, [lowerAddress, readIntent, clearIntent, refetchPositionsWrapper]);

  // Update refs when state changes
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    imageSrcRef.current = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    storedLastNftIdRef.current = storedLastNftId;
  }, [storedLastNftId]);

  useEffect(() => {
    positionsRef.current = positions || [];
  }, [positions]);

  // Track position resolution and update imageSrc when found
  useEffect(() => {
    if (!open || !imageSrc || !lowerAddress || !storedLastNftId) return;

    // Use stored expected legs to check position
    if (!storedExpectedLegs || storedExpectedLegs.length === 0) return;

    const list: Parlay[] = positions || [];

    // Create a temporary intent-like object for checkAndUpdatePosition
    const tempIntent: ShareIntentStored = {
      address: lowerAddress,
      anchor: 'positions',
      clientTimestamp: storedClientTimestamp || Date.now(),
      lastNftId: storedLastNftId,
      betslip: {
        legs: storedExpectedLegs,
        wager: '',
        symbol: 'testUSDe',
      },
    };

    const resolved = checkAndUpdatePosition(tempIntent, list, storedLastNftId);

    if (resolved?.predictorNftTokenId && resolved.marketAddress) {
      const ogUrl = buildOgUrlFromNftAndMarket(
        resolved.predictorNftTokenId,
        resolved.marketAddress,
        resolved
      );

      if (ogUrl && imageSrc !== ogUrl) {
        setImageSrc(ogUrl);
      }
    }
  }, [
    open,
    imageSrc,
    lowerAddress,
    positions,
    storedLastNftId,
    storedExpectedLegs,
    storedClientTimestamp,
    checkAndUpdatePosition,
    buildOgUrlFromNftAndMarket,
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
      // Clear stored state when dialog closes
      setStoredClientTimestamp(undefined);
      setStoredTxHash(undefined);
      setStoredExpectedLegs(undefined);
      setStoredLastNftId(undefined);
    }
  }, [open, imageSrc]);

  // Get position timestamp and expected legs from stored state
  const positionTimestamp = useMemo(() => {
    if (!imageSrc) return undefined;
    return storedClientTimestamp;
  }, [imageSrc, storedClientTimestamp]);

  const txHash = useMemo(() => {
    if (!imageSrc) return undefined;
    return storedTxHash;
  }, [imageSrc, storedTxHash]);

  const expectedLegs = useMemo(() => {
    if (!imageSrc) return undefined;
    return storedExpectedLegs;
  }, [imageSrc, storedExpectedLegs]);

  const lastNftId = useMemo(() => {
    if (!imageSrc) {
      return undefined;
    }
    return storedLastNftId;
  }, [imageSrc, storedLastNftId]);

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
