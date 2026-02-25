'use client';

import type React from 'react';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseUnits, formatEther, formatUnits } from 'viem';
import { Pin, ChevronDown } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useValidatedAuctionBids } from '~/lib/auction/useValidatedAuctionBids';
import AuctionRequestInfo from '~/components/terminal/AuctionRequestInfo';
import AuctionRequestChart from '~/components/terminal/AuctionRequestChart';
import { useAccount, useReadContract } from 'wagmi';
import {
  predictionMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { useTerminalLogsOptional } from '~/components/terminal/TerminalLogsContext';
import { useBidPreflight, useLegacyBidSubmission } from '~/hooks/auction';
import PercentChance from '~/components/shared/PercentChance';
import { decodeAuctionPredictedOutcomes } from '~/lib/auction/decodePredictedOutcomes';

type Props = {
  uiTx: UiTransaction;
  predictionsContent: React.ReactNode;
  auctionId: string | null;
  takerCollateral: string | null;
  taker: string | null;
  resolver: string | null;
  predictedOutcomes: string[];
  collateralAssetTicker: string;
  onTogglePin?: (auctionId: string | null) => void;
  isPinned?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: (auctionId: string | null) => void;
  /** Escrow picks array */
  escrowPicks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
};

const AuctionRequestRow: React.FC<Props> = ({
  uiTx,
  predictionsContent,
  auctionId,
  takerCollateral,
  taker,
  resolver,
  predictedOutcomes,
  collateralAssetTicker,
  onTogglePin,
  isPinned,
  isExpanded: isExpandedProp,
  onToggleExpanded,
  escrowPicks,
}) => {
  const { address } = useAccount();
  const { openConnectDialog } = useConnectDialog();
  // TODO: Get chainId from context/props when supporting multiple chains
  const chainId = CHAIN_ID_ETHEREAL_TESTNET;
  const { toast } = useToast();
  const { openApproval } = useApprovalDialog();
  const terminalLogs = useTerminalLogsOptional();

  // Use shared preflight hook for chain switching, balance, and allowance validation
  const { runPreflight, tokenDecimals: _preflightDecimals } = useBidPreflight({
    onError: (errorMessage) => {
      toast({
        title: 'Validation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Use shared bid submission hook for signing and WebSocket submission
  const { submitBid: submitBidToWs } = useLegacyBidSubmission({
    onSignatureRejected: (error) => {
      toast({
        title: 'Signature rejected',
        description: error.message,
      });
    },
  });
  // Always use PredictionMarketEscrow
  const PREDICTION_MARKET_ADDRESS = predictionMarketEscrow[chainId]?.address;
  const COLLATERAL_ADDRESS = collateralToken[chainId]?.address ?? collateralToken[DEFAULT_CHAIN_ID]?.address;
  // Read token decimals
  const { data: tokenDecimalsData } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });
  const tokenDecimals = useMemo(() => {
    try {
      return typeof tokenDecimalsData === 'number'
        ? tokenDecimalsData
        : Number(tokenDecimalsData ?? 18);
    } catch {
      return 18;
    }
  }, [tokenDecimalsData]);
  // Taker nonce no longer needed — escrow counterparty uses their own nonce

  // Use controlled expanded state if provided, otherwise fall back to local state
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = isExpandedProp ?? localExpanded;

  // Use validated auction bids - validates bids by simulating mint transactions
  // Only run validation when the row is expanded to save RPC calls
  const { validBids, invalidBidCount, totalBidCount } = useValidatedAuctionBids(
    auctionId,
    {
      chainId,
      predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
      takerAddress: taker as `0x${string}` | undefined,
      takerCollateral: takerCollateral ?? undefined,
      encodedPredictedOutcomes: predictedOutcomes?.[0] as
        | `0x${string}`
        | undefined,
      resolver: resolver as `0x${string}` | undefined,
      enabled: isExpanded,
    }
  );
  const [highlightNewBid, setHighlightNewBid] = useState(false);
  const numBids = totalBidCount;
  const bidsLabel = useMemo(
    () => (numBids === 1 ? '1 BID' : `${numBids} BIDS`),
    [numBids]
  );

  // Compute best bid summary from valid bids only
  // validBids are already filtered for non-expired and valid status
  const bestBidSummary = useMemo(() => {
    try {
      if (!Array.isArray(validBids) || validBids.length === 0) return null;
      const best = validBids.reduce((prev, curr) => {
        try {
          const currVal = BigInt(String(curr?.makerCollateral ?? '0'));
          const prevVal = BigInt(String(prev?.makerCollateral ?? '0'));
          return currVal > prevVal ? curr : prev;
        } catch {
          return prev;
        }
      }, validBids[0]);
      const makerBid = (() => {
        try {
          return BigInt(String(best?.makerCollateral ?? '0'));
        } catch {
          return 0n;
        }
      })();
      const requester = (() => {
        try {
          return BigInt(String(takerCollateral ?? '0'));
        } catch {
          return 0n;
        }
      })();
      const total = makerBid + requester;

      let bidDisplay = '—';
      let payoutDisplay = '—';
      try {
        const bidNum = Number(formatEther(makerBid));
        if (Number.isFinite(bidNum)) {
          bidDisplay = bidNum.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      } catch {
        /* noop */
      }
      try {
        const payoutNum = Number(formatEther(total));
        if (Number.isFinite(payoutNum)) {
          payoutDisplay = payoutNum.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      } catch {
        /* noop */
      }

      let pct: number | null = null;
      try {
        if (total > 0n) {
          const pctTimes100 = Number((makerBid * 10000n) / total);
          pct = Math.round(pctTimes100 / 100);
        }
      } catch {
        pct = null;
      }
      return {
        bidDisplay,
        payoutDisplay,
        pct,
      };
    } catch {
      return null;
    }
  }, [validBids, takerCollateral]);

  const takerCollateralDisplay = useMemo(() => {
    try {
      if (!takerCollateral) return null;
      const requester = BigInt(String(takerCollateral));
      const requesterNum = Number(formatEther(requester));
      if (!Number.isFinite(requesterNum)) return null;
      return requesterNum.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return null;
    }
  }, [takerCollateral]);

  const summaryWrapperClass =
    'text-[11px] sm:text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-2 text-muted-foreground';

  const primaryAmountText = bestBidSummary
    ? bestBidSummary.bidDisplay === '—'
      ? '—'
      : `${bestBidSummary.bidDisplay} ${collateralAssetTicker}`
    : takerCollateralDisplay
      ? `${takerCollateralDisplay} ${collateralAssetTicker}`
      : '—';
  const secondaryAmountText = bestBidSummary
    ? bestBidSummary.payoutDisplay === '—'
      ? '—'
      : `${bestBidSummary.payoutDisplay} ${collateralAssetTicker}`
    : null;
  const hasBestBid = Boolean(bestBidSummary);

  // Pulse highlight when a new bid is received
  const prevBidsRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    const count = numBids;
    // Skip initial mount to avoid false-positive pulse when the row is first rendered
    if (!initializedRef.current) {
      prevBidsRef.current = count;
      initializedRef.current = true;
      setHighlightNewBid(false);
      return;
    }
    if (count > prevBidsRef.current) {
      setHighlightNewBid(true);
      // Update ref immediately so we only pulse once per new bid
      prevBidsRef.current = count;
      if (pulseTimeoutRef.current != null)
        window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = window.setTimeout(() => {
        setHighlightNewBid(false);
        pulseTimeoutRef.current = null;
      }, 900);
    } else {
      prevBidsRef.current = count;
    }
  }, [numBids]);
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current != null)
        window.clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  // Decode predicted outcomes to extract condition IDs
  const decodedOutcomes = useMemo(() => {
    return decodeAuctionPredictedOutcomes({
      resolver,
      predictedOutcomes,
    });
  }, [resolver, predictedOutcomes]);

  const conditionIds = useMemo(() => {
    try {
      if (decodedOutcomes.kind !== 'uma') return [] as string[];
      return decodedOutcomes.outcomes
        .map((o) => (o?.marketId ? String(o.marketId) : ''))
        .filter(Boolean);
    } catch {
      return [] as string[];
    }
  }, [decodedOutcomes]);

  // Fetch conditions by IDs to get endTime values
  const { list: conditionEnds = [] } = useConditionsByIds(conditionIds);

  const maxEndTimeSec = useMemo(() => {
    try {
      if (decodedOutcomes.kind === 'pyth') {
        const ends = decodedOutcomes.outcomes
          .map((o) => Number(o?.endTime ?? 0n))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (ends.length === 0) return null;
        return Math.max(...ends);
      }
      if (!Array.isArray(conditionEnds) || conditionEnds.length === 0)
        return null;
      const ends = conditionEnds
        .map((c) => Number(c?.endTime || 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ends.length === 0) return null;
      return Math.max(...ends);
    } catch {
      return null;
    }
  }, [conditionEnds, decodedOutcomes]);

  const submitBid = useCallback(
    async (data: {
      amount: string;
      expirySeconds: number;
      mode: 'duration' | 'datetime';
    }) => {
      try {
        if (!auctionId) {
          toast({
            title: 'Auction not ready',
            description: 'This auction is not active yet. Please try again.',
          });
          return;
        }
        // Ensure connected wallet FIRST
        const maker = address;
        if (!maker) {
          openConnectDialog();
          return;
        }

        // Parse amount
        const decimalsToUse = Number.isFinite(tokenDecimals)
          ? tokenDecimals
          : 18;
        const amountNum = Number(data.amount || '0');
        const makerCollateralWei = parseUnits(
          String(data.amount || '0'),
          decimalsToUse
        );
        if (makerCollateralWei <= 0n) {
          toast({
            title: 'Invalid amount',
            description: 'Enter a valid bid amount greater than 0.',
          });
          return;
        }

        // Run preflight checks: chain switch, balance, allowance
        const preflightResult = await runPreflight(amountNum);

        if (!preflightResult.canProceed) {
          // Log the issue to terminal logs
          if (preflightResult.blockedReason === 'insufficient_balance') {
            terminalLogs?.pushBidLog({
              source: 'manual',
              action: 'insufficient_balance',
              amount: data.amount,
              collateralSymbol: collateralAssetTicker,
              meta: {
                requiredAmount: amountNum,
                balanceValue: preflightResult.details?.balanceValue,
                auctionId,
              },
              dedupeKey: `manual-balance:${auctionId}:${Date.now()}`,
            });
            toast({
              title: 'Insufficient balance',
              description: 'You do not have enough balance to place this bid.',
              variant: 'destructive',
            });
            return;
          }

          if (preflightResult.blockedReason === 'insufficient_allowance') {
            // Just open the approval dialog - no need to log
            openApproval(String(data.amount || ''));
            return;
          }

          if (preflightResult.blockedReason === 'chain_switch_failed') {
            // Error already shown via onError callback
            return;
          }

          // Wallet not connected or other issue
          return;
        }

        // Ensure essential auction context (after preflight checks)
        const hasEscrowPicks =
          Array.isArray(escrowPicks) && escrowPicks.length > 0;
        const encodedPredicted =
          Array.isArray(predictedOutcomes) && predictedOutcomes[0]
            ? (predictedOutcomes[0] as `0x${string}`)
            : undefined;
        const resolverAddr =
          typeof resolver === 'string' ? resolver : undefined;
        const takerCollateralWei = (() => {
          try {
            return BigInt(String(takerCollateral ?? '0'));
          } catch {
            return 0n;
          }
        })();

        const hasPredictionData = hasEscrowPicks || !!encodedPredicted;

        if (
          !hasPredictionData ||
          !resolverAddr ||
          takerCollateralWei <= 0n ||
          !taker
        ) {
          const missing: string[] = [];
          if (!hasPredictionData) missing.push('escrow picks');
          if (!resolverAddr) missing.push('resolver');
          if (takerCollateralWei <= 0n) missing.push('taker position size');
          if (!taker) missing.push('taker');
          toast({
            title: 'Request not ready',
            description:
              missing.length > 0
                ? `Missing: ${missing.join(', ')}`
                : 'Required data not available yet. Please try again.',
            variant: 'destructive' as any,
          });
          return;
        }

                const result = await submitBidToWs({
          auctionId,
          makerCollateral: makerCollateralWei,
          takerCollateral: takerCollateralWei,
          predictedOutcomes: encodedPredicted ? [encodedPredicted] : [],
          resolver: resolverAddr as `0x${string}`,
          taker: taker as `0x${string}`,
          expirySeconds: data.expirySeconds,
          maxEndTimeSec: maxEndTimeSec ?? undefined,
          escrowPicks,
        });

        if (result.success) {
          // Calculate total payout (makerCollateral + takerCollateral)
          const totalWei = makerCollateralWei + takerCollateralWei;
          const decimalsForFormat = Number.isFinite(tokenDecimals)
            ? tokenDecimals
            : 18;
          const payoutFormatted = Number(
            formatUnits(totalWei, decimalsForFormat)
          ).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          });

          // Log successful bid to terminal logs
          terminalLogs?.pushBidLog({
            source: 'manual',
            action: 'submitted',
            amount: data.amount,
            payoutAmount: payoutFormatted,
            collateralSymbol: collateralAssetTicker,
            meta: {
              auctionId,
              makerCollateral: makerCollateralWei.toString(),
              takerCollateral: takerCollateralWei.toString(),
            },
          });
          toast({
            title: 'Bid submitted',
            description: 'Your bid was submitted successfully.',
          });
        } else {
          // Error handling is done via hook callbacks, but log the error
          terminalLogs?.pushBidLog({
            source: 'manual',
            action: 'error',
            meta: { auctionId },
            customMessage: `You bid ${result.error || 'Unknown error'}`,
          });
        }
      } catch (e) {
        // Log error to terminal logs
        terminalLogs?.pushBidLog({
          source: 'manual',
          action: 'error',
          meta: { auctionId },
          customMessage: `You bid ${e instanceof Error ? e.message : 'Unknown error'}`,
        });
        toast({
          title: 'Bid failed',
          description: 'Unable to submit bid',
          variant: 'destructive' as any,
        });
      }
    },
    [
      auctionId,
      predictedOutcomes,
      taker,
      resolver,
      takerCollateral,

      address,
      openConnectDialog,
      runPreflight,
      submitBidToWs,
      terminalLogs,
      collateralAssetTicker,
      toast,
      openApproval,
      tokenDecimals,
      maxEndTimeSec,

      escrowPicks,
    ]
  );

  return (
    <div
      className={
        'px-4 py-3 relative group h-full min-h-0 border-b border-border/60'
      }
    >
      <div className="flex items-center justify-between gap-3 min-h-[28px] flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0">
          {/* label removed */}
          <div className={'mb-0'}>{predictionsContent}</div>
        </div>
        <div className={summaryWrapperClass}>
          <span className="font-mono text-brand-white tabular-nums">
            {primaryAmountText}
          </span>
          {hasBestBid ? (
            <>
              <span className="text-muted-foreground">for payout</span>
              <span className="font-mono text-brand-white tabular-nums">
                {secondaryAmountText ?? '—'}
              </span>
            </>
          ) : null}
          {hasBestBid && typeof bestBidSummary?.pct === 'number' ? (
            <PercentChance
              probability={bestBidSummary.pct / 100}
              showLabel
              label="chance"
              className="font-mono text-ethena tabular-nums text-right min-w-[90px] -ml-0.5"
            />
          ) : null}
        </div>
        <div className="inline-flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = !isExpanded;
              try {
                window.dispatchEvent(new Event('terminal.row.toggled'));
                window.dispatchEvent(
                  new Event(
                    next ? 'terminal.row.expanded' : 'terminal.row.collapsed'
                  )
                );
              } catch {
                void 0;
              }
              if (onToggleExpanded) {
                onToggleExpanded(auctionId);
              } else {
                setLocalExpanded(next);
              }
            }}
            className={
              highlightNewBid
                ? 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-[hsl(var(--accent-gold)/0.7)] bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 transition-colors duration-300 ease-out bg-[hsl(var(--accent-gold)/0.06)] text-accent-gold'
                : 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 text-brand-white transition-colors duration-300 ease-out'
            }
            aria-label={
              isExpanded ? `Collapse: ${bidsLabel}` : `Expand: ${bidsLabel}`
            }
          >
            <span className="font-mono">{bidsLabel}</span>
            <ChevronDown
              className={
                (isExpanded
                  ? 'ml-1 h-3.5 w-3.5 rotate-180'
                  : 'ml-1 h-3.5 w-3.5 rotate-0') +
                ' transition-transform duration-300 ease-out'
              }
            />
          </button>
          <button
            type="button"
            onClick={() => onTogglePin?.(auctionId || null)}
            className={
              isPinned
                ? 'inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] flex-shrink-0'
                : 'inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-accent text-brand-white hover:text-brand-white text-[10px] flex-shrink-0'
            }
            aria-label={isPinned ? 'Unpin auction' : 'Pin auction'}
          >
            <Pin className="h-3 w-3" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="expanded"
            className="py-3 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 items-stretch min-h-0"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
            onAnimationComplete={() => {
              try {
                window.dispatchEvent(new Event('terminal.row.layout'));
              } catch {
                void 0;
              }
            }}
          >
            <AuctionRequestChart
              bids={validBids}
              takerCollateral={takerCollateral}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              taker={taker}
              hasMultipleConditions={conditionIds.length > 1}
              tokenDecimals={tokenDecimals}
              invalidBidCount={invalidBidCount}
            />
            <AuctionRequestInfo
              uiTx={uiTx}
              bids={validBids}
              takerCollateral={takerCollateral}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              onSubmit={submitBid}
              taker={taker}
              resolver={resolver}
              predictedOutcomes={predictedOutcomes}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default AuctionRequestRow;
