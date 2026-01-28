'use client';

import type React from 'react';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseUnits, formatEther, formatUnits } from 'viem';
import { Pin, ChevronDown } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionBids } from '~/lib/auction/useAuctionBids';
import AuctionRequestInfo from '~/components/terminal/AuctionRequestInfo';
import AuctionRequestChart from '~/components/terminal/AuctionRequestChart';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { predictionMarket, collateralToken } from '@sapience/sdk/contracts';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { predictionMarketAbi } from '@sapience/sdk';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { useTerminalLogsOptional } from '~/components/terminal/TerminalLogsContext';
import { useBidPreflight, useBidSubmission } from '~/hooks/auction';
import PercentChance from '~/components/shared/PercentChance';
import { decodeAuctionPredictedOutcomes } from '~/lib/auction/decodePredictedOutcomes';

type Props = {
  uiTx: UiTransaction;
  predictionsContent: React.ReactNode;
  auctionId: string | null;
  takerWager: string | null;
  taker: string | null;
  resolver: string | null;
  predictedOutcomes: string[];
  takerNonce: number | null;
  collateralAssetTicker: string;
  onTogglePin?: (auctionId: string | null) => void;
  isPinned?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: (auctionId: string | null) => void;
};

const AuctionRequestRow: React.FC<Props> = ({
  uiTx,
  predictionsContent,
  auctionId,
  takerWager,
  taker,
  resolver,
  predictedOutcomes,
  takerNonce,
  collateralAssetTicker,
  onTogglePin,
  isPinned,
  isExpanded: isExpandedProp,
  onToggleExpanded,
}) => {
  const { bids } = useAuctionBids(auctionId);
  const { address } = useAccount();
  const { openConnectDialog } = useConnectDialog();
  const chainId = CHAIN_ID_ETHEREAL;
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
  const { submitBid: submitBidToWs } = useBidSubmission({
    onSignatureRejected: (error) => {
      toast({
        title: 'Signature rejected',
        description: error.message,
      });
    },
  });
  // Resolve collateral token from PredictionMarket config (fallback to default constant)
  const PREDICTION_MARKET_ADDRESS = predictionMarket[chainId]?.address;
  const predictionMarketConfigRead = useReadContracts({
    contracts: PREDICTION_MARKET_ADDRESS
      ? [
          {
            address: PREDICTION_MARKET_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!PREDICTION_MARKET_ADDRESS },
  });
  const COLLATERAL_ADDRESS = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      try {
        const cfg = item.result as { collateralToken: `0x${string}` };
        if (cfg?.collateralToken) return cfg.collateralToken;
      } catch {
        /* noop */
      }
    }
    return collateralToken[DEFAULT_CHAIN_ID]?.address;
  }, [predictionMarketConfigRead.data]);
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
  // Read taker nonce on-chain for the provided taker address
  const { data: takerNonceOnChain, refetch: refetchTakerNonce } =
    useReadContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'nonces',
      args: typeof taker === 'string' ? [taker as `0x${string}`] : undefined,
      chainId: chainId,
      query: {
        enabled: Boolean(PREDICTION_MARKET_ADDRESS && taker),
      },
    });
  // Use controlled expanded state if provided, otherwise fall back to local state
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = isExpandedProp ?? localExpanded;
  const [highlightNewBid, setHighlightNewBid] = useState(false);
  const numBids = useMemo(
    () => (Array.isArray(bids) ? bids.length : 0),
    [bids]
  );
  const bidsLabel = useMemo(
    () => (numBids === 1 ? '1 BID' : `${numBids} BIDS`),
    [numBids]
  );

  const bestBidSummary = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return null;
      const nowMs = Date.now();
      const active = bids.filter((b) => {
        // Filter out zero address bids
        if (
          !b?.maker ||
          b.maker.toLowerCase() === '0x0000000000000000000000000000000000000000'
        )
          return false;
        const deadlineSec = Number(b?.makerDeadline || 0);
        if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return false;
        return deadlineSec * 1000 > nowMs;
      });
      if (active.length === 0) return null;
      const best = active.reduce((prev, curr) => {
        try {
          const currVal = BigInt(String(curr?.makerWager ?? '0'));
          const prevVal = BigInt(String(prev?.makerWager ?? '0'));
          return currVal > prevVal ? curr : prev;
        } catch {
          return prev;
        }
      }, active[0]);
      const makerBid = (() => {
        try {
          return BigInt(String(best?.makerWager ?? '0'));
        } catch {
          return 0n;
        }
      })();
      const requester = (() => {
        try {
          return BigInt(String(takerWager ?? '0'));
        } catch {
          return 0n;
        }
      })();
      const total = makerBid + requester;

      let bidDisplay = '—';
      let toWinDisplay = '—';
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
        const toWinNum = Number(formatEther(total));
        if (Number.isFinite(toWinNum)) {
          toWinDisplay = toWinNum.toLocaleString(undefined, {
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
        toWinDisplay,
        pct,
      };
    } catch {
      return null;
    }
  }, [bids, takerWager]);

  const takerWagerDisplay = useMemo(() => {
    try {
      if (!takerWager) return null;
      const requester = BigInt(String(takerWager));
      const requesterNum = Number(formatEther(requester));
      if (!Number.isFinite(requesterNum)) return null;
      return requesterNum.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return null;
    }
  }, [takerWager]);

  const summaryWrapperClass =
    'text-[11px] sm:text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-2 text-muted-foreground';

  const primaryAmountText = bestBidSummary
    ? bestBidSummary.bidDisplay === '—'
      ? '—'
      : `${bestBidSummary.bidDisplay} ${collateralAssetTicker}`
    : takerWagerDisplay
      ? `${takerWagerDisplay} ${collateralAssetTicker}`
      : '—';
  const secondaryAmountText = bestBidSummary
    ? bestBidSummary.toWinDisplay === '—'
      ? '—'
      : `${bestBidSummary.toWinDisplay} ${collateralAssetTicker}`
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
        const makerWagerWei = parseUnits(
          String(data.amount || '0'),
          decimalsToUse
        );
        if (makerWagerWei <= 0n) {
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
        const encodedPredicted =
          Array.isArray(predictedOutcomes) && predictedOutcomes[0]
            ? (predictedOutcomes[0] as `0x${string}`)
            : undefined;
        const resolverAddr =
          typeof resolver === 'string' ? resolver : undefined;
        const takerWagerWei = (() => {
          try {
            return BigInt(String(takerWager ?? '0'));
          } catch {
            return 0n;
          }
        })();
        // Resolve maker nonce: prefer feed-provided, fall back to on-chain
        let takerNonceVal: number | undefined =
          typeof takerNonce === 'number' ? takerNonce : undefined;
        if (takerNonceVal === undefined) {
          try {
            const fresh = await Promise.resolve(refetchTakerNonce?.());
            const raw = fresh?.data ?? takerNonceOnChain;
            const n = Number(raw);
            if (Number.isFinite(n)) takerNonceVal = n;
          } catch {
            /* noop */
          }
        }
        if (
          !encodedPredicted ||
          !resolverAddr ||
          takerNonceVal === undefined ||
          takerWagerWei <= 0n ||
          !taker
        ) {
          const missing: string[] = [];
          if (!encodedPredicted) missing.push('predicted outcomes');
          if (!resolverAddr) missing.push('resolver');
          if (takerNonceVal === undefined) missing.push('maker nonce');
          if (takerWagerWei <= 0n) missing.push('taker wager');
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

        // Use shared bid submission hook for signing and WebSocket
        const result = await submitBidToWs({
          auctionId,
          makerWager: makerWagerWei,
          takerWager: takerWagerWei,
          predictedOutcomes: [encodedPredicted],
          resolver: resolverAddr as `0x${string}`,
          taker: taker as `0x${string}`,
          takerNonce: takerNonceVal,
          expirySeconds: data.expirySeconds,
          maxEndTimeSec: maxEndTimeSec ?? undefined,
        });

        if (result.success) {
          // Calculate total to win (makerWager + takerWager)
          const totalWei = makerWagerWei + takerWagerWei;
          const decimalsForFormat = Number.isFinite(tokenDecimals)
            ? tokenDecimals
            : 18;
          const toWinFormatted = Number(
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
            toWinAmount: toWinFormatted,
            collateralSymbol: collateralAssetTicker,
            meta: {
              auctionId,
              makerWager: makerWagerWei.toString(),
              takerWager: takerWagerWei.toString(),
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
      takerWager,
      takerNonce,
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
      refetchTakerNonce,
      takerNonceOnChain,
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
              <span className="text-muted-foreground">to win</span>
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
              bids={bids}
              takerWager={takerWager}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              taker={taker}
              hasMultipleConditions={conditionIds.length > 1}
              tokenDecimals={tokenDecimals}
            />
            <AuctionRequestInfo
              uiTx={uiTx}
              bids={bids}
              takerWager={takerWager}
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
