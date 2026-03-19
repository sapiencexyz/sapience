'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { generateRandomNonce } from '@sapience/sdk';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useToast } from '@sapience/ui/hooks/use-toast';
import {
  PredictionListItem,
  type PythPrediction,
  type PredictionListItemData,
} from '@sapience/ui';
import SponsorshipIndicator from './SponsorshipIndicator';
import { PythMarketBadge } from '~/components/shared/PythMarketBadge';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { PositionSizeInput } from '~/components/markets/forms';
import BidDisplay from '~/components/markets/forms/shared/BidDisplay';
import { buildPythAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useCollateralBalanceContext } from '~/lib/context/CollateralBalanceContext';
import { useSession } from '~/lib/context/SessionContext';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle, getColorWithAlpha } from '~/lib/utils/categoryStyle';
import { getMaxPositionSize } from '~/lib/utils/positionFormUtils';
import { logPositionForm, formatBidForLog } from '~/lib/auction/bidLogger';
import { getAuctionTriggerMode } from '~/lib/auction/auctionTriggerMode';
import { useSponsorStatus } from '~/hooks/sponsorship/useSponsorStatus';
import { useSponsorshipActivation } from '~/hooks/sponsorship/useSponsorshipActivation';

const EMPTY_BIDS: QuoteBid[] = [];

interface PositionFormProps {
  methods: UseFormReturn<{
    positionSize: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; positionSize: string; isFlipped?: boolean }
    >;
  }>;
  /** Submit handler - receives the exact bid being submitted to ensure what user sees is what gets submitted */
  onSubmit: (bid: QuoteBid) => void;
  isSubmitting: boolean;
  error?: string | null;
  chainId?: number;
  bids?: QuoteBid[];
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  // Collateral token configuration from useSubmitPosition hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minPositionSize?: string;
  // PredictionMarketEscrow contract address for fetching predictor nonce
  predictionMarketAddress?: `0x${string}`;
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
}

export default function PositionForm({
  methods,
  onSubmit,
  isSubmitting,
  error,
  chainId = 42161,
  bids = EMPTY_BIDS,
  requestQuotes,
  collateralToken,
  collateralSymbol: collateralSymbolProp,
  collateralDecimals,
  minPositionSize,
  predictionMarketAddress: _predictionMarketAddress,
  pythPredictions = [],
  onRemovePythPrediction,
}: PositionFormProps) {
  const { selections, removeSelection, getPolymarketPicks } =
    useCreatePositionContext();
  const { address: predictorAddress } = useAccount();
  const { hasConnectedWallet } = useConnectedWallet();
  const { openConnectDialog } = useConnectDialog();
  const { toast } = useToast();
  const fallbackCollateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const collateralSymbol = collateralSymbolProp || fallbackCollateralSymbol;
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const isEtherealChain =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );
  // Keep the last estimate visible even if subsequent bids arrive as pending/failed
  // so the UI doesn't flicker back to a disabled "waiting" state.
  const [stickyEstimateBid, setStickyEstimateBid] = useState<QuoteBid | null>(
    null
  );
  // State for managing bid clearing when position size/selections change (for animations)
  // IMPORTANT: do NOT seed from `bids` prop.
  // `bids` comes from a shared auction hook and may contain leftover quotes from
  // a previous request for a different prediction set. We only want to display
  // bids after *this* form initiates an auction for the current inputs.
  const [validBids, setValidBids] = useState<QuoteBid[]>([]);

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();
  const {
    effectiveAddress,
    isUsingSmartAccount,
    signMessage: sessionSignMessage,
  } = useSession();

  // Sponsorship status
  const {
    isSponsored,
    sponsorAddress,
    remainingBudget,
    maxEntryPriceBps,
    matchLimit,
    requiredCounterparty,
  } = useSponsorStatus();

  // Sponsorship activation state machine (timeout, reset, activate).
  // Callbacks are ref-ified inside the hook so triggerAuctionRequest (defined below) resolves at call-time.
  const triggerAuctionRequestRef = useRef<
    (opts?: { forceRefresh?: boolean; withSponsor?: boolean }) => void
  >(() => {});
  const {
    sponsorshipActivated,
    awaitingSponsoredBid,
    activateSponsor,
    clearAwaiting,
    resetSponsor,
  } = useSponsorshipActivation({
    onActivate: () =>
      triggerAuctionRequestRef.current({
        forceRefresh: true,
        withSponsor: true,
      }),
    onTimeout: () => triggerAuctionRequestRef.current({ forceRefresh: true }),
  });

  // Determine the actual predictor address based on signing method
  // This MUST match the logic in useAuctionStart.requestQuotes
  // - If using session signing (smart account with active session): use effectiveAddress (smart account)
  // - Otherwise (signing with wallet): use predictorAddress (wallet)
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const willUseSessionSigning = isUsingSmartAccount && !!sessionSignMessage;
  const triggerMode = getAuctionTriggerMode(
    willUseSessionSigning,
    hasConnectedWallet
  );
  const selectedPredictorAddress = willUseSessionSigning
    ? (effectiveAddress ?? predictorAddress ?? ZERO_ADDRESS)
    : (predictorAddress ?? ZERO_ADDRESS);

  // Stable refs — read at call time inside triggerAuctionRequest, don't trigger recreation
  const selectedPredictorAddressRef = useRef(selectedPredictorAddress);
  useEffect(() => {
    selectedPredictorAddressRef.current = selectedPredictorAddress;
  }, [selectedPredictorAddress]);

  const requestQuotesRef = useRef(requestQuotes);
  useEffect(() => {
    requestQuotesRef.current = requestQuotes;
  }, [requestQuotes]);

  // Get user's collateral balance from context (shared with form schema validation)
  const { balance: userBalance, isLoading: isBalanceLoading } =
    useCollateralBalanceContext();

  // Escrow uses random bitmap nonces (Permit2-style) — no contract read needed
  const refetchTakerNonce = useCallback(
    () => Promise.resolve({ data: generateRandomNonce() }),
    []
  );
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

  const positionSizeValue = useWatch({
    control: methods.control,
    name: 'positionSize',
  });
  const prevPositionSizeRef = useRef<string>(positionSizeValue || '');
  // Track the request configuration to ignore stale bids
  const currentRequestKeyRef = useRef<string | null>(null);
  // Guard to prevent multiple concurrent auction requests
  const auctionRequestInFlightRef = useRef<boolean>(false);

  // Apply rainbow hover effect only for position sizes over 1k
  const isRainbowHoverEnabled = useMemo(() => {
    if (!positionSizeValue) return false;
    const sizeNum = Number(positionSizeValue);
    return !Number.isNaN(sizeNum) && sizeNum > 1000;
  }, [positionSizeValue]);

  // Calculate predictor position size in wei for auction chart
  const predictorPositionSizeWei = useMemo(() => {
    const decimals = collateralDecimals ?? 18;
    try {
      return parseUnits(positionSizeValue || '0', decimals).toString();
    } catch {
      return '0';
    }
  }, [positionSizeValue, collateralDecimals]);

  // Create a stable key from all prediction legs (UMA + Pyth) to detect changes
  // and ensure we clear/re-key bids correctly when *either* leg set changes.
  const predictionsKey = useMemo(() => {
    const umaKey = selections
      .map((s) => `${s.conditionId}:${s.prediction}`)
      .sort()
      .join('|');
    const pythKey = (pythPredictions || [])
      .map(
        (p) =>
          `${p.priceId}:${p.direction}:${p.targetPriceRaw ?? p.targetPrice}:${p.dateTimeLocal}`
      )
      .sort()
      .join('|');
    return [umaKey, pythKey].filter(Boolean).join('||');
  }, [selections, pythPredictions]);
  const prevPredictionsKeyRef = useRef<string>(predictionsKey);

  // Clear bids when position size changes (for animations)
  useEffect(() => {
    if (prevPositionSizeRef.current !== (positionSizeValue || '')) {
      logPositionForm(
        `Position size changed to ${positionSizeValue || '(empty)'}, clearing bids`
      );
      setValidBids([]);
      setStickyEstimateBid(null);
      resetSponsor();
      setLastQuoteRequestMs(null); // Reset cooldown when position size changes
      currentRequestKeyRef.current = null; // Ignore incoming bids for old configuration
      prevPositionSizeRef.current = positionSizeValue || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSizeValue]);

  // Clear bids when wallet connection state changes
  // Old bids were generated for a different predictor address (zero address for logged-out, user address for logged-in)
  const prevHasConnectedWalletRef = useRef(hasConnectedWallet);
  useEffect(() => {
    if (prevHasConnectedWalletRef.current !== hasConnectedWallet) {
      logPositionForm(
        `Wallet ${hasConnectedWallet ? 'connected' : 'disconnected'}, clearing bids`
      );
      setValidBids([]);
      setStickyEstimateBid(null);
      resetSponsor();
      setLastQuoteRequestMs(null);
      currentRequestKeyRef.current = null;
      prevHasConnectedWalletRef.current = hasConnectedWallet;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasConnectedWallet]);

  // Clear bids when trigger mode changes (e.g. switching between EOA and Smart Account)
  // Old bids were generated for a different predictor address
  const prevTriggerModeRef = useRef(triggerMode);
  useEffect(() => {
    if (prevTriggerModeRef.current !== triggerMode) {
      logPositionForm(
        `Trigger mode changed from ${prevTriggerModeRef.current} to ${triggerMode}, clearing bids`
      );
      setValidBids([]);
      setStickyEstimateBid(null);
      resetSponsor();
      setLastQuoteRequestMs(null);
      currentRequestKeyRef.current = null;
      prevTriggerModeRef.current = triggerMode;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerMode]);

  // Clear bids when selections change (prediction flipped, added, or removed) (for animations)
  useEffect(() => {
    if (prevPredictionsKeyRef.current !== predictionsKey) {
      logPositionForm('Predictions changed, clearing bids');
      setValidBids([]);
      setStickyEstimateBid(null);
      resetSponsor();
      setLastQuoteRequestMs(null); // Reset cooldown when selections change
      currentRequestKeyRef.current = null; // Ignore incoming bids for old configuration
      prevPredictionsKeyRef.current = predictionsKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionsKey]);

  // Update valid bids when new bids come in (for animations)
  // Only accept bids if they match the current request configuration
  useEffect(() => {
    const currentRequestKey = `${predictionsKey}:${positionSizeValue || ''}`;
    // If we have a request key set, only accept bids that match it
    // If request key is null, it means selections/position size changed, so ignore all incoming bids
    if (currentRequestKeyRef.current === null) {
      if (bids.length > 0) {
        logPositionForm(
          `[accept] REJECTED: currentRequestKeyRef is null. bids=${bids.length}, currentKey=${currentRequestKey.slice(0, 40)}`
        );
      }
      return;
    }
    // Only accept bids if they match the current request
    if (currentRequestKeyRef.current === currentRequestKey) {
      if (bids.length > 0) {
        logPositionForm(
          `[accept] ACCEPTED ${bids.length} bid(s). validationStatus=${bids[0]?.validationStatus}, key=${currentRequestKey.slice(0, 40)}`
        );
      }
      setValidBids(bids);
      clearAwaiting();
    } else if (bids.length > 0) {
      logPositionForm(
        `[accept] REJECTED: key mismatch. ref=${currentRequestKeyRef.current?.slice(0, 40)}, current=${currentRequestKey.slice(0, 40)}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, predictionsKey, positionSizeValue]);

  // Track previous filter result to avoid logging on every tick
  const prevFilterResultRef = useRef<string | null>(null);

  // Filter bids: only show bids marked as valid as best bids
  const { bestBid, estimateBid } = useMemo(() => {
    if (!validBids || validBids.length === 0) {
      prevFilterResultRef.current = null;
      return { bestBid: null, estimateBid: null };
    }

    // Separate estimator bids (vault-bot with deadline=1 sentinel) from regular bids
    const estimatorBids = validBids.filter(
      (bid) =>
        bid.counterparty?.toLowerCase() ===
          PREFERRED_ESTIMATE_QUOTER.toLowerCase() &&
        bid.validationStatus === 'valid'
    );
    const regularBids = validBids.filter(
      (bid) =>
        bid.counterparty?.toLowerCase() !==
        PREFERRED_ESTIMATE_QUOTER.toLowerCase()
    );

    // Apply expiry filter only to regular bids (estimator bids use deadline=1 sentinel)
    const nonExpiredBids = regularBids.filter(
      (bid) => bid.counterpartyDeadline * 1000 > nowMs
    );

    if (nonExpiredBids.length === 0 && estimatorBids.length === 0) {
      const resultKey = 'all-expired';
      if (prevFilterResultRef.current !== resultKey) {
        logPositionForm(
          `[bestBid] All ${validBids.length} bid(s) expired. First deadline=${validBids[0]?.counterpartyDeadline}, nowSec=${Math.floor(nowMs / 1000)}`
        );
        prevFilterResultRef.current = resultKey;
      }
      return { bestBid: null, estimateBid: null };
    }

    // Only bids marked as valid are valid for submission
    const validFilteredBids = nonExpiredBids.filter(
      (bid) => bid.validationStatus === 'valid'
    );

    // If we have no valid bids and exactly one invalid bid, show it as an estimate.
    // This matches the "single failing bid shows ESTIMATE" behavior.
    const failedBids = nonExpiredBids.filter(
      (bid) => bid.validationStatus === 'invalid'
    );

    const estimateFromFailed =
      validFilteredBids.length === 0 && failedBids.length === 1
        ? failedBids[0]
        : null;

    if (validFilteredBids.length === 0) {
      // No valid regular bids — fall back to best estimator bid or failed estimate
      const bestEstimator =
        estimatorBids.length > 0
          ? estimatorBids.reduce((acc, current) => {
              try {
                return BigInt(current.counterpartyCollateral) >
                  BigInt(acc.counterpartyCollateral)
                  ? current
                  : acc;
              } catch {
                return acc;
              }
            })
          : null;

      const estimate = bestEstimator ?? estimateFromFailed;
      const resultKey = estimate
        ? `estimate:${estimate.counterparty}`
        : `no-valid:${failedBids.length}`;
      if (prevFilterResultRef.current !== resultKey) {
        if (estimate) {
          logPositionForm(
            `Using estimate: ${formatBidForLog(estimate, collateralDecimals)}`
          );
        }
        prevFilterResultRef.current = resultKey;
      }
      return { bestBid: null, estimateBid: estimate };
    }

    // Select the bid with highest counterpartyCollateral (highest payout for user)
    const best = validFilteredBids.reduce((acc, current) => {
      try {
        return BigInt(current.counterpartyCollateral) >
          BigInt(acc.counterpartyCollateral)
          ? current
          : acc;
      } catch {
        return acc;
      }
    });

    const resultKey = `best:${best.counterparty}:${best.counterpartyCollateral}`;
    if (prevFilterResultRef.current !== resultKey) {
      logPositionForm(`Best bid: ${formatBidForLog(best, collateralDecimals)}`);
      prevFilterResultRef.current = resultKey;
    }

    return { bestBid: best, estimateBid: null };
  }, [validBids, nowMs, collateralDecimals]);

  // Make estimate "sticky" so it doesn't disappear while we're still waiting for a success bid.
  useEffect(() => {
    if (bestBid) {
      setStickyEstimateBid(null);
      return;
    }
    if (estimateBid) {
      setStickyEstimateBid(estimateBid);
      return;
    }
    // Clear the sticky estimate when there are no non-expired bids left.
    // Estimator bids use deadline=1 (sentinel) and should not cause clearing.
    const hasAnyNonExpired = bids.some(
      (b) =>
        b.counterpartyDeadline * 1000 > nowMs ||
        b.counterparty?.toLowerCase() ===
          PREFERRED_ESTIMATE_QUOTER.toLowerCase()
    );
    if (!hasAnyNonExpired) setStickyEstimateBid(null);
  }, [bestBid, estimateBid, bids, nowMs]);

  // Cooldown duration for showing loader after requesting bids (15 seconds)
  const QUOTE_COOLDOWN_MS = 15000;

  // Check if we recently made a request - show loader during cooldown
  const recentlyRequested =
    lastQuoteRequestMs != null &&
    nowMs - lastQuoteRequestMs < QUOTE_COOLDOWN_MS;

  // Restart cooldown when we receive an estimate bid (failed simulation)
  // This keeps the loader showing while waiting for valid bids
  const prevEstimateBidRef = useRef<typeof estimateBid>(null);
  useEffect(() => {
    if (estimateBid && !prevEstimateBidRef.current) {
      // For estimator bids (final answer for logged-out users), don't restart cooldown
      const isFromEstimator =
        estimateBid.counterparty?.toLowerCase() ===
        PREFERRED_ESTIMATE_QUOTER.toLowerCase();
      if (!isFromEstimator) {
        setLastQuoteRequestMs(Date.now());
      }
    }
    prevEstimateBidRef.current = estimateBid;
  }, [estimateBid]);

  // Derive a stable dependency for form validation state
  const hasFormErrors = Object.keys(methods.formState.errors).length > 0;

  const totalPredictionCount = selections.length + pythPredictions.length;

  const triggerAuctionRequest = useCallback(
    async (options?: { forceRefresh?: boolean; withSponsor?: boolean }) => {
      // Prevent multiple concurrent auction requests
      if (auctionRequestInFlightRef.current) {
        return;
      }

      if (!requestQuotesRef.current || !selectedPredictorAddressRef.current) {
        return;
      }

      const hasUma = selections.length > 0;
      const hasPyth = pythPredictions.length > 0;

      if (!hasUma && !hasPyth) {
        return;
      }
      if (hasFormErrors) {
        return;
      }

      const positionSizeStr = positionSizeValue || '0';

      // Set in-flight flag to prevent concurrent requests
      auctionRequestInFlightRef.current = true;

      try {
        // Reset display state for a new request (prevents stale "active bid" while awaiting quotes).
        setValidBids([]);
        setStickyEstimateBid(null);

        // Fetch fresh nonce via wagmi refetch (bypasses stale cache)
        const nonceResult = await refetchTakerNonce();
        const freshNonce = nonceResult.data;

        if (freshNonce === undefined && predictorAddress) {
          auctionRequestInFlightRef.current = false;
          return;
        }

        const decimals = collateralDecimals ?? 18;
        const positionSizeWei = parseUnits(
          positionSizeStr,
          decimals
        ).toString();

        let pythEscrowPicks:
          | Array<{
              conditionResolver: `0x${string}`;
              conditionId: `0x${string}`;
              predictedOutcome: number;
            }>
          | undefined;

        if (hasPyth) {
          const p = buildPythAuctionStartPayload(
            pythPredictions.map((pp) => ({
              priceId: pp.priceId,
              direction: pp.direction,
              targetPrice: pp.targetPrice,
              targetPriceRaw: pp.targetPriceRaw,
              priceExpo: pp.priceExpo,
              dateTimeLocal: pp.dateTimeLocal,
            })),
            chainId
          );
          pythEscrowPicks = p.escrowPicks;
        }

        // Build picks — required for all auction types
        let picks: AuctionParams['picks'] = [];
        if (hasPyth && pythEscrowPicks) {
          picks = pythEscrowPicks;
        } else if (hasUma) {
          const conditionPicks = getPolymarketPicks();
          if (conditionPicks.length > 0) {
            picks = conditionPicks;
          } else {
            console.warn(
              '[PositionForm] Escrow chain but getPolymarketPicks() empty',
              selections.map((s) => ({
                id: s.conditionId,
                resolver: s.resolverAddress,
              }))
            );
          }
        }

        const params: AuctionParams = {
          wager: positionSizeWei,
          predictor: selectedPredictorAddressRef.current,
          predictorNonce: freshNonce !== undefined ? Number(freshNonce) : 0,
          chainId: chainId,
          picks,
        };

        // Only thread sponsor when the user explicitly activates sponsorship.
        // Initial quotes are always unsponored so the bid is usable for self-funded
        // mints; if the bid qualifies, the user clicks "Use" to re-request with sponsor.
        if (options?.withSponsor && sponsorAddress) {
          params.predictorSponsor = sponsorAddress;
          params.predictorSponsorData = '0x';
        }

        requestQuotesRef.current(params, {
          forceRefresh: options?.forceRefresh,
        });
        setLastQuoteRequestMs(Date.now());
        // Set the request key to match incoming bids to this configuration
        currentRequestKeyRef.current = `${predictionsKey}:${positionSizeValue || ''}`;
        logPositionForm(
          `[triggerAuction] Key set: ${currentRequestKeyRef.current.slice(0, 50)}, picks=${params.picks?.length ?? 0}`
        );

        // Clear in-flight flag after a short delay to allow the debounced request to start
        // This prevents duplicate requests while still allowing future requests
        setTimeout(() => {
          auctionRequestInFlightRef.current = false;
        }, 500);
      } catch (err) {
        // Don't fail silently (especially important for Pyth payload normalization issues).
        auctionRequestInFlightRef.current = false;
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error';
        toast({
          title: 'Could not initiate auction',
          description: msg,
          variant: 'destructive',
          duration: 7000,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selections,
      pythPredictions,
      toast,
      predictorAddress,
      hasFormErrors,
      positionSizeValue,
      collateralDecimals,
      chainId,
      predictionsKey,
      getPolymarketPicks,
      sponsorAddress,
    ]
  );

  // Keep ref in sync so the sponsorship hook can call triggerAuctionRequest
  useEffect(() => {
    triggerAuctionRequestRef.current = triggerAuctionRequest;
  }, [triggerAuctionRequest]);

  // Handler for "Initiate Auction" button - works for all users
  // Logged-out users get unsigned auctions that display as estimates
  const handleRequestBids = useCallback(() => {
    logPositionForm('Requesting bids (manual)');
    triggerAuctionRequest({
      forceRefresh: true,
    });
  }, [triggerAuctionRequest]);

  // Auto-initiate auction when content (predictions/position size) changes
  // We debounce this to avoid spamming the auction endpoint while the user is typing
  // In 'manual' mode (non-session connected wallet), skip auto-trigger entirely —
  // the user must click "INITIATE AUCTION" to start the auction.
  const autoAuctionDebounceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Manual mode: don't auto-fire, require explicit user action
    if (triggerMode === 'manual') return;

    // Wait for balance to load before triggering (auto mode only)
    if (triggerMode === 'auto' && isBalanceLoading) return;

    // Don't auto-trigger if there are form errors (auto mode only)
    if (triggerMode === 'auto' && hasFormErrors) return;

    // Must have at least one UMA prediction or at least one Pyth prediction
    const hasPredictions = selections.length >= 1 || pythPredictions.length > 0;
    if (!hasPredictions) return;

    // Must have a valid position size
    const sizeNum = Number(positionSizeValue || '0');
    if (sizeNum <= 0 || Number.isNaN(sizeNum)) return;

    // Don't auto-trigger if position size exceeds user's balance (auto mode only)
    // Logged-out users can enter any position size to see estimates
    if (triggerMode === 'auto' && sizeNum > userBalance) return;

    // Clear previous debounce timer
    if (autoAuctionDebounceRef.current !== undefined) {
      window.clearTimeout(autoAuctionDebounceRef.current);
    }

    // Debounce for 300ms to let user finish typing/selecting
    autoAuctionDebounceRef.current = window.setTimeout(() => {
      logPositionForm('Requesting bids (auto)');
      triggerAuctionRequest({
        forceRefresh: true,
      });
    }, 300);

    return () => {
      if (autoAuctionDebounceRef.current !== undefined) {
        window.clearTimeout(autoAuctionDebounceRef.current);
      }
    };
  }, [
    triggerMode,
    isBalanceLoading,
    hasFormErrors,
    predictionsKey,
    positionSizeValue,
    triggerAuctionRequest,
    selections.length,
    pythPredictions.length,
    userBalance,
  ]);

  // Show "Request Bids" button when:
  // 1. No valid bids exist (never received or all expired)
  // 2. Not in the cooldown period after making a request
  // Since automatic auction trigger is disabled, show button immediately when no bids
  const showNoBidsHint = !bestBid && !recentlyRequested;

  // Show "Some combinations may not receive bids" hint after 3 seconds of no bids
  // This replaces the disclaimer after waiting for bids without success
  const HINT_DELAY_MS = 3000;
  const showNoBidsWarning =
    lastQuoteRequestMs !== null &&
    !bestBid &&
    nowMs - lastQuoteRequestMs >= HINT_DELAY_MS;

  // Toggle between disclaimer and hint when bids may not arrive
  const HINT_DELAY_MS_TRANSITION = 300;
  const [disclaimerMounted, setDisclaimerMounted] = useState(true);
  const [hintMounted, setHintMounted] = useState(false);

  useEffect(() => {
    let timeout1: number | undefined;
    let timeout2: number | undefined;

    if (showNoBidsWarning) {
      if (!hintMounted) {
        // Hide disclaimer, then show hint
        timeout1 = window.setTimeout(() => {
          setDisclaimerMounted(false);
          setHintMounted(true);
        }, HINT_DELAY_MS_TRANSITION);
      }
    } else {
      if (hintMounted) {
        // Hide hint, then show disclaimer
        timeout2 = window.setTimeout(() => {
          setHintMounted(false);
          setDisclaimerMounted(true);
        }, HINT_DELAY_MS_TRANSITION);
      } else {
        // Ensure disclaimer is visible by default
        setDisclaimerMounted(true);
      }
    }

    return () => {
      if (timeout1) window.clearTimeout(timeout1);
      if (timeout2) window.clearTimeout(timeout2);
    };
  }, [showNoBidsWarning, hintMounted]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-4 px-4 pb-4 pt-4"
      >
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-mono mb-3 flex justify-between items-center">
            <span>
              {totalPredictionCount}{' '}
              {totalPredictionCount !== 1 ? 'PREDICTIONS' : 'PREDICTION'}
            </span>
            <AnimatePresence>
              {totalPredictionCount > 1 && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground/50 flex items-center gap-1 ml-2"
                >
                  <Info
                    className="hidden sm:inline h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  ALL MUST BE CORRECT TO WIN
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {[
            ...pythPredictions.map((p) => ({ kind: 'pyth' as const, p })),
            ...selections.map((s) => ({ kind: 'market' as const, s })),
          ].map((item, index) => {
            if (item.kind === 'pyth') {
              const p = item.p;
              const predictionData: PredictionListItemData = {
                id: p.id,
                question: `${p.priceFeedLabel ?? 'Crypto'} OVER $${p.targetPrice.toLocaleString()}`,
                prediction: p.direction === 'over',
              };
              return (
                <div
                  key={p.id}
                  className={`-mx-4 px-4 py-2.5 border-b border-brand-white/10 ${index === 0 ? 'border-t' : ''}`}
                >
                  <PredictionListItem
                    prediction={predictionData}
                    leading={<PythMarketBadge className="w-5 h-5" />}
                    onRemove={onRemovePythPrediction}
                  />
                </div>
              );
            }

            const s = item.s;
            const CategoryIcon = getCategoryIcon(s.categorySlug);
            const categoryColor = getCategoryStyle(s.categorySlug).color;
            // Convert color to 10% opacity background (matches MarketBadge style)
            const bgWithAlpha = getColorWithAlpha(categoryColor, 0.1);
            // In CreatePositionForm: show shortName if available, always show question in tooltip
            const displayTitle = s.shortName || s.question;
            const predictionData: PredictionListItemData = {
              id: s.id,
              conditionId: s.conditionId,
              question: displayTitle,
              prediction: s.prediction,
              categorySlug: s.categorySlug,
            };
            return (
              <div
                key={s.id}
                className={`-mx-4 px-4 py-2.5 border-b border-brand-white/10 ${index === 0 ? 'border-t' : ''}`}
              >
                <PredictionListItem
                  prediction={predictionData}
                  leading={
                    <div
                      className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: bgWithAlpha }}
                    >
                      <CategoryIcon
                        className="w-[60%] h-[60%]"
                        style={{ color: categoryColor, strokeWidth: 1 }}
                      />
                    </div>
                  }
                  title={
                    <ConditionTitleLink
                      conditionId={s.conditionId}
                      resolverAddress={s.resolverAddress ?? undefined}
                      title={displayTitle}
                      tooltipTitle={s.question}
                      clampLines={1}
                      className="text-sm"
                    />
                  }
                  onRemove={removeSelection}
                />
              </div>
            );
          })}

          <div className="mt-5">
            <PositionSizeInput
              minAmount={minPositionSize}
              maxAmount={getMaxPositionSize(userBalance, isEtherealChain)}
              collateralSymbol={collateralSymbol}
              collateralAddress={collateralToken}
              chainId={chainId}
            />
          </div>

          {/* Sponsorship indicator — two-step: show eligibility first, activate on click */}
          <SponsorshipIndicator
            isSponsored={isSponsored}
            sponsorAddress={sponsorAddress}
            remainingBudget={remainingBudget}
            maxEntryPriceBps={maxEntryPriceBps}
            matchLimit={matchLimit}
            requiredCounterparty={requiredCounterparty}
            bestBid={bestBid}
            positionSizeValue={positionSizeValue || ''}
            collateralDecimals={collateralDecimals}
            collateralSymbol={collateralSymbol}
            sponsorshipActivated={sponsorshipActivated}
            awaitingSponsoredBid={awaitingSponsoredBid}
            onActivate={activateSponsor}
          />

          <div className="mt-5 space-y-1">
            <RestrictedJurisdictionBanner
              show={!isPermitLoading && isRestricted}
              className="mb-3"
            />
            <BidDisplay
              bestBid={bestBid}
              estimateBid={stickyEstimateBid}
              positionSize={positionSizeValue || '0'}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              nowMs={nowMs}
              showRequestBidsButton={showNoBidsHint}
              onRequestBids={handleRequestBids}
              isSubmitting={isSubmitting}
              onSubmit={onSubmit}
              isSubmitDisabled={
                isPermitLoading || isRestricted || awaitingSponsoredBid
              }
              enableRainbowHover={isRainbowHoverEnabled}
              hintMounted={hintMounted}
              disclaimerMounted={disclaimerMounted}
              allBids={validBids}
              predictorPositionSizeWei={predictorPositionSizeWei}
              predictorAddress={selectedPredictorAddress}
              showAddPredictionsHint={selections.length === 1 && !bestBid}
              isAuctionPending={
                recentlyRequested && !bestBid && !stickyEstimateBid
              }
              hasFormErrors={hasFormErrors}
              isLoggedOut={!hasConnectedWallet}
              onConnectClick={openConnectDialog}
            />
          </div>
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
        </div>
      </form>
      <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Place a Limit Order</DialogTitle>
          </DialogHeader>
          <p className="text-center my-6 text-sm text-muted-foreground">
            Coming soon
          </p>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
