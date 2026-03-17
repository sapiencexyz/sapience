import { useCallback, useEffect, useRef } from 'react';
import { parseUnits, formatUnits, type PublicClient } from 'viem';
import type { Order } from '../types';
import type { PushLogEntryParams } from '~/components/terminal/TerminalLogsContext';
import {
  decodePredictedOutcomes,
  formatOrderLabelSnapshot,
  formatOrderTag,
  getConditionMatchInfo,
  normalizeAddress,
  resolveMessageField,
} from '../utils';
import type { AuctionFeedMessage } from '~/lib/auction/useAuctionRelayerFeed';
import type {
  EscrowBidSubmissionParams,
  EscrowBidSubmissionResult,
} from '~/hooks/auction/useEscrowBidSubmission';
import { validateBidFull } from '@sapience/sdk/auction/validation';
import { getPublicClientForChainId } from '~/lib/utils/util';

/** Shape of the data payload from auction WebSocket messages */
interface AuctionMessageData {
  resolver?: string;
  predictor?: string;
  predictorCollateral?: string;
  escrowPicks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
  payload?: {
    resolver?: string;
    predictor?: string;
    predictorCollateral?: string;
    escrowPicks?: Array<{
      conditionResolver: string;
      conditionId: string;
      predictedOutcome: number;
    }>;
  };
  [key: string]: unknown;
}

function asMessageData(data: unknown): AuctionMessageData {
  if (data && typeof data === 'object') return data as AuctionMessageData;
  return {} as AuctionMessageData;
}

// Cache and deduplication limits
const MAX_AUCTION_CACHE_SIZE = 200;
const MAX_PROCESSED_BIDS_SIZE = 500;
const MAX_PROCESSED_MESSAGES = 1200;
const BID_EXPIRY_SECONDS = 30;

/** Cached auction context from auction.started messages */
type AuctionContext = {
  predictedOutcomes: `0x${string}`[];
  resolver: `0x${string}`;
  predictor: `0x${string}`;
  predictorCollateral: string;
  escrowPicks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
};

type UseAuctionMatchingParams = {
  orders: Order[];
  getOrderIndex: (order: Order) => number;
  pushLogEntry: (entry: PushLogEntryParams) => void;
  balanceValue: number;
  allowanceValue: number;
  isPermitLoading: boolean;
  isRestricted: boolean;
  address?: `0x${string}`;
  collateralSymbol: string;
  tokenDecimals: number;
  auctionMessages: AuctionFeedMessage[];
  formatCollateralAmount: (value?: string | null) => string | null;
  submitBid: (
    params: EscrowBidSubmissionParams
  ) => Promise<EscrowBidSubmissionResult>;
  predictionMarketAddress?: `0x${string}`;
  collateralTokenAddress?: `0x${string}`;
  chainId: number;
};

export function useAuctionMatching({
  orders,
  getOrderIndex,
  pushLogEntry,
  balanceValue,
  allowanceValue,
  isPermitLoading,
  isRestricted,
  address,
  collateralSymbol,
  tokenDecimals,
  auctionMessages,
  formatCollateralAmount,
  submitBid,
  predictionMarketAddress,
  collateralTokenAddress,
  chainId,
}: UseAuctionMatchingParams) {
  const processedMessageIdsRef = useRef<Set<number>>(new Set());
  const processedMessageQueueRef = useRef<number[]>([]);
  // Cache auction context from auction.started messages for use by copy_trade on auction.bids
  const auctionContextCacheRef = useRef<Map<string, AuctionContext>>(new Map());
  // Track insertion order for LRU eviction
  const auctionContextKeysRef = useRef<string[]>([]);

  // Track processed bids by (orderId + auctionId + bidSignature) to avoid duplicate submissions
  // when the same bid appears in multiple auction.bids messages
  const processedBidsRef = useRef<Set<string>>(new Set());
  const processedBidsQueueRef = useRef<string[]>([]);
  // Track bids currently undergoing async validation to prevent duplicate submissions
  // during the validation window (separate from processedBidsRef which is permanent)
  const validatingBidsRef = useRef<Set<string>>(new Set());

  const evaluateAutoBidReadiness = useCallback(
    (details: {
      order: Order;
      context: {
        kind: 'copy_trade' | 'conditions';
        summary: string;
        auctionId?: string | null;
        estimatedSpend?: number | null;
        dedupeSuffix?: string | null;
      };
    }) => {
      const dedupeBase = `${details.order.id}:${
        details.context.kind
      }:${details.context.auctionId ?? 'none'}:${
        details.context.dedupeSuffix ?? 'default'
      }`;

      const orderTag = formatOrderTag(details.order, null, getOrderIndex);
      const orderLabelSnapshot = formatOrderLabelSnapshot(orderTag);

      if (isPermitLoading) {
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} compliance check pending; holding auto-bid`,
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: orderTag,
            highlight: 'compliance check pending; holding auto-bid',
          },
          dedupeKey: `permit:${dedupeBase}`,
        });
        return { blocked: true as const, reason: 'permit_loading' as const };
      }

      const requiredSpend =
        typeof details.context.estimatedSpend === 'number' &&
        Number.isFinite(details.context.estimatedSpend)
          ? details.context.estimatedSpend
          : null;

      // Check balance first (prioritize over allowance)
      const insufficientBalance =
        requiredSpend != null
          ? balanceValue < requiredSpend
          : balanceValue <= 0;

      if (insufficientBalance) {
        const statusMessage = 'Insufficient account balance';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: orderTag,
            verb: 'bid',
            requiredSpend,
            balanceValue,
            highlight: statusMessage,
          },
          // Dedupe per order + auction only (not per bid) so it shows once per auction attempt
          dedupeKey: `balance:${details.order.id}:${details.context.auctionId ?? 'none'}`,
        });
        return { blocked: true as const, reason: 'balance' as const };
      }

      // Check allowance after balance
      const insufficientAllowance =
        requiredSpend != null
          ? allowanceValue < requiredSpend
          : allowanceValue <= 0;

      if (insufficientAllowance) {
        const statusMessage = 'Insufficient spend approved';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: orderTag,
            verb: 'bid',
            requiredSpend,
            allowanceValue,
            highlight: statusMessage,
          },
          // Dedupe per order + auction only (not per bid) so it shows once per auction attempt
          dedupeKey: `allowance:${details.order.id}:${details.context.auctionId ?? 'none'}`,
        });
        return { blocked: true as const, reason: 'allowance' as const };
      }

      if (isRestricted) {
        const statusMessage =
          'You cannot access this app from a restricted region';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'error',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: orderTag,
            verb: 'bid',
            highlight: statusMessage,
          },
          dedupeKey: `geofence:${dedupeBase}`,
        });
        return { blocked: true as const, reason: 'geofence' as const };
      }

      // Ready to submit - no log needed here, will log after successful submission
      return { blocked: false as const, reason: null };
    },
    [
      allowanceValue,
      balanceValue,
      getOrderIndex,
      isPermitLoading,
      isRestricted,
      pushLogEntry,
    ]
  );

  // Helper to mark a bid as processed (called on successful signature)
  const markBidProcessed = useCallback((dedupeKey: string) => {
    if (processedBidsRef.current.has(dedupeKey)) return;
    processedBidsRef.current.add(dedupeKey);
    processedBidsQueueRef.current.push(dedupeKey);
    // Evict oldest entries if cache exceeds limit
    while (processedBidsQueueRef.current.length > MAX_PROCESSED_BIDS_SIZE) {
      const oldest = processedBidsQueueRef.current.shift();
      if (oldest) processedBidsRef.current.delete(oldest);
    }
  }, []);

  const triggerAutoBidSubmission = useCallback(
    async (details: {
      order: Order;
      source: 'copy_trade' | 'conditions';
      /** For conditions: whether the match is inverted (opposite side) */
      inverted?: boolean;
      auctionId?: string | null;
      /** Auction context from the feed message */
      auctionContext?: {
        predictorCollateral: string; // wei string
        predictor: `0x${string}`;
        predictedOutcomes: `0x${string}`[];
        resolver: `0x${string}`;
        escrowPicks?: Array<{
          conditionResolver: string;
          conditionId: string;
          predictedOutcome: number;
        }>;
      };
      /** For copy_trade: the bid we're copying + increment */
      copyBidContext?: {
        copiedBidCollateral: string; // wei string from the bid we're copying
        increment: number; // human-readable increment from order config
      };
      /** Dedupe key to mark as processed on successful signature */
      dedupeKey?: string;
    }) => {
      const tag = formatOrderTag(details.order, null, getOrderIndex);
      const orderLabelSnapshot = formatOrderLabelSnapshot(tag);

      // Validate required auction context
      if (!details.auctionId || !details.auctionContext) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, missing auction context`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: tag,
            verb: 'bid',
            highlight: 'skipped, missing auction context',
          },
          dedupeKey: `context:${details.order.id}:${details.auctionId ?? 'na'}`,
        });
        return;
      }

      const { predictorCollateral, predictor, escrowPicks } =
        details.auctionContext;

      // Calculate our bid amount (counterpartyCollateral)
      let counterpartyCollateralWei: bigint;
      try {
        if (details.source === 'copy_trade' && details.copyBidContext) {
          // For copy_trade: copied bid + increment
          const copiedWei = BigInt(
            details.copyBidContext.copiedBidCollateral || '0'
          );
          const incrementWei = parseUnits(
            String(details.copyBidContext.increment || 0),
            tokenDecimals
          );
          counterpartyCollateralWei = copiedWei + incrementWei;
        } else {
          // For conditions strategy: calculate position size based on probability threshold
          // Formula: counterpartyCollateral = (probability * predictorCollateral) / (1 - probability)
          // This gives us the exact odds we want
          const predictorCollateralBigInt = BigInt(predictorCollateral || '0');
          const rawProbability = (details.order.odds ?? 50) / 100; // odds is stored as percentage (0-100)
          // Invert probability for opposite-side matches (single-leg orders matching the other side)
          const probability = details.inverted
            ? 1 - rawProbability
            : rawProbability;

          if (probability >= 1 || probability <= 0) {
            // Invalid probability, skip
            pushLogEntry({
              kind: 'system',
              message: `${tag} bid skipped, invalid probability threshold`,
              severity: 'warning',
              meta: {
                orderId: details.order.id,
                labelSnapshot: orderLabelSnapshot,
                formattedPrefix: tag,
                verb: 'bid',
                highlight: 'skipped, invalid probability threshold',
                probability: details.order.odds,
              },
              dedupeKey: `prob:${details.order.id}:${details.auctionId}`,
            });
            return;
          }

          // Calculate using bigint math with precision scaling to avoid floating point errors
          // counterpartyCollateral = (probability * predictorCollateral) / (1 - probability)
          const PRECISION = 10000n;
          const probabilityScaled = BigInt(Math.round(probability * 10000));
          const numerator = probabilityScaled * predictorCollateralBigInt;
          const denominator = PRECISION - probabilityScaled;

          if (denominator <= 0n || numerator <= 0n) {
            pushLogEntry({
              kind: 'system',
              message: `${tag} bid skipped, cannot calculate position size`,
              severity: 'warning',
              meta: {
                orderId: details.order.id,
                labelSnapshot: orderLabelSnapshot,
                formattedPrefix: tag,
                verb: 'bid',
                highlight: 'skipped, cannot calculate position size',
              },
              dedupeKey: `calc:${details.order.id}:${details.auctionId}`,
            });
            return;
          }

          counterpartyCollateralWei = numerator / denominator;
        }
      } catch {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, invalid bid amount`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: tag,
            verb: 'bid',
            highlight: 'skipped, invalid bid amount',
          },
          dedupeKey: `amount:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      if (counterpartyCollateralWei <= 0n) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, zero bid amount`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: tag,
            verb: 'bid',
            highlight: 'skipped, zero bid amount',
          },
          dedupeKey: `zero:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      const expirySeconds = BID_EXPIRY_SECONDS;

      try {
        // Actually submit the bid using the shared hook
        const result = await submitBid({
          auctionId: details.auctionId,
          counterpartyCollateral: counterpartyCollateralWei,
          predictorCollateral: BigInt(predictorCollateral || '0'),
          predictor,
          expirySeconds,
          picks: escrowPicks ?? [],
        });

        const counterpartyAmount = formatCollateralAmount(
          counterpartyCollateralWei.toString()
        );
        const predictorCollateralBigInt = BigInt(predictorCollateral || '0');
        const totalWei = counterpartyCollateralWei + predictorCollateralBigInt;
        const payoutAmount = formatCollateralAmount(totalWei.toString());

        const submittedStatus =
          counterpartyAmount && payoutAmount
            ? `${counterpartyAmount} ${collateralSymbol} for payout ${payoutAmount} ${collateralSymbol}`
            : counterpartyAmount
              ? `${counterpartyAmount} ${collateralSymbol}`
              : 'Submitted';

        if (result.signature) {
          // Bid was signed and sent - mark as processed to prevent retries
          if (details.dedupeKey) {
            markBidProcessed(details.dedupeKey);
          }
          // Log as success regardless of ack status
          pushLogEntry({
            kind: 'system',
            message: `${tag} bid ${submittedStatus}`,
            severity: 'success',
            meta: {
              orderId: details.order.id,
              labelSnapshot: orderLabelSnapshot,
              formattedPrefix: tag,
              verb: 'bid',
              source: details.source,
              auctionId: details.auctionId,
              highlight: submittedStatus,
              counterpartyCollateral: counterpartyCollateralWei.toString(),
              predictorCollateral,
            },
          });
        } else {
          // Log failed submission (signature was rejected or other error)
          const errorHighlight = result.error || 'Unknown error';
          pushLogEntry({
            kind: 'system',
            message: `${tag} bid ${errorHighlight}`,
            severity: 'error',
            meta: {
              orderId: details.order.id,
              labelSnapshot: orderLabelSnapshot,
              formattedPrefix: tag,
              verb: 'bid',
              source: details.source,
              auctionId: details.auctionId,
              highlight: errorHighlight,
              error: result.error,
            },
            dedupeKey: `failed:${details.order.id}:${details.auctionId}`,
          });
        }
      } catch (error) {
        const errorHighlight = (error as Error)?.message || 'Unknown error';
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid ${errorHighlight}`,
          severity: 'error',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            formattedPrefix: tag,
            verb: 'bid',
            highlight: errorHighlight,
          },
          dedupeKey: `error:${details.order.id}:${details.auctionId ?? 'na'}`,
        });
      }
    },
    [
      collateralSymbol,
      formatCollateralAmount,
      getOrderIndex,
      markBidProcessed,
      pushLogEntry,
      submitBid,
      tokenDecimals,
    ]
  );

  const handleCopyTradeMatches = useCallback(
    (entry: AuctionFeedMessage) => {
      const rawBids = resolveMessageField(entry?.data, 'bids');
      const bids = Array.isArray(rawBids) ? rawBids : [];
      if (bids.length === 0) {
        return;
      }
      const activeCopyOrders = orders.filter(
        (order) =>
          order.strategy === 'copy_trade' &&
          order.status === 'active' &&
          !!order.copyTradeAddress
      );
      if (activeCopyOrders.length === 0) {
        return;
      }
      const normalizedOrders = activeCopyOrders
        .map((order) => ({
          order,
          address: normalizeAddress(order.copyTradeAddress),
        }))
        .filter((item) => Boolean(item.address)) as Array<{
        order: Order;
        address: string;
      }>;
      if (normalizedOrders.length === 0) {
        return;
      }
      bids.forEach((bid: unknown) => {
        const bidRecord = bid as Record<string, unknown> | null;
        const counterpartyRaw =
          typeof bidRecord?.counterparty === 'string'
            ? bidRecord.counterparty
            : null;
        const counterpartyAddr = normalizeAddress(counterpartyRaw);
        if (!counterpartyAddr) return;
        // Guard: never copy your own bids (prevents self-outbidding loops)
        const normalizedSelf = normalizeAddress(address ?? null);
        if (normalizedSelf && counterpartyAddr === normalizedSelf) return;
        const matched = normalizedOrders.find(
          (item) => item.address === counterpartyAddr
        );
        if (!matched) return;
        const auctionId =
          (typeof bidRecord?.auctionId === 'string' && bidRecord.auctionId) ||
          entry.channel ||
          null;

        // Look up cached auction context from auction.started message
        const cachedContext = auctionId
          ? auctionContextCacheRef.current.get(auctionId)
          : null;
        if (!cachedContext) {
          // No cached context - auction.started message may not have been received yet
          // This can happen if the user joins mid-auction or network issues occur
          return;
        }

        const signature =
          typeof bidRecord?.counterpartySignature === 'string'
            ? bidRecord.counterpartySignature
            : null;

        // Create a unique key for this bid to prevent duplicate submissions
        // when the same bid appears in multiple auction.bids messages
        const bidDedupeKey = `${matched.order.id}:${auctionId}:${signature ?? `${counterpartyAddr}:${bidRecord?.counterpartyCollateral ?? '0'}`}`;

        // Skip if we've already processed or are currently validating this bid
        if (
          processedBidsRef.current.has(bidDedupeKey) ||
          validatingBidsRef.current.has(bidDedupeKey)
        ) {
          return;
        }

        const tag = formatOrderTag(matched.order, null, getOrderIndex);
        const increment =
          typeof matched.order.increment === 'number' &&
          Number.isFinite(matched.order.increment)
            ? matched.order.increment
            : 1;

        // Calculate the full bid amount for allowance checking (copiedCollateral + increment)
        // This ensures we don't prompt for signature if allowance is insufficient
        const copiedCollateralWei = BigInt(
          String(bidRecord?.counterpartyCollateral ?? '0')
        );
        let estimatedSpend: number;
        try {
          const incrementWei = parseUnits(String(increment), tokenDecimals);
          const totalWei = copiedCollateralWei + incrementWei;
          estimatedSpend = Number(formatUnits(totalWei, tokenDecimals));
        } catch {
          // Fallback to just increment if parsing fails
          estimatedSpend = increment;
        }

        const readiness = evaluateAutoBidReadiness({
          order: matched.order,
          context: {
            kind: 'copy_trade',
            summary: tag,
            auctionId,
            estimatedSpend,
            dedupeSuffix: signature ?? counterpartyAddr,
          },
        });
        if (!readiness.blocked) {
          // Validate the copied bid before outbidding (anti-spoofing)
          if (
            predictionMarketAddress &&
            collateralTokenAddress &&
            signature &&
            cachedContext.escrowPicks
          ) {
            // Mark as in-flight to prevent duplicate submissions during async validation
            validatingBidsRef.current.add(bidDedupeKey);

            const bidPayload = {
              auctionId: auctionId!,
              counterparty: counterpartyAddr,
              counterpartyCollateral: String(
                bidRecord?.counterpartyCollateral ?? '0'
              ),
              counterpartyNonce: Number(bidRecord?.counterpartyNonce ?? 0),
              counterpartyDeadline: Number(
                bidRecord?.counterpartyDeadline ?? 0
              ),
              counterpartySignature: signature,
            };
            // Tier 1 + Tier 2 validation — signature + on-chain state
            validateBidFull(
              bidPayload,
              {
                picks: cachedContext.escrowPicks,
                predictorCollateral: cachedContext.predictorCollateral,
                predictor: cachedContext.predictor,
                chainId,
              },
              {
                verifyingContract: predictionMarketAddress,
                chainId,
                predictionMarketAddress,
                collateralTokenAddress,
                publicClient: getPublicClientForChainId(
                  chainId
                ) as PublicClient,
              }
            )
              .then((bidResult) => {
                if (bidResult.status === 'invalid') {
                  // Invalid bid — mark permanently so we never retry
                  markBidProcessed(bidDedupeKey);
                  pushLogEntry({
                    kind: 'system',
                    message: `${tag} skipped outbid — copied bid is invalid: ${bidResult.reason}`,
                    severity: 'warning',
                    meta: {
                      orderId: matched.order.id,
                      labelSnapshot: formatOrderLabelSnapshot(tag),
                      formattedPrefix: tag,
                      verb: 'bid',
                      highlight: `skipped, copied bid invalid`,
                    },
                    dedupeKey: `spoofcheck:${bidDedupeKey}`,
                  });
                  return;
                }
                // Valid or unverified — proceed with outbid
                // dedupeKey passed to triggerAutoBidSubmission marks as processed on successful signature
                void triggerAutoBidSubmission({
                  order: matched.order,
                  source: 'copy_trade',
                  auctionId,
                  auctionContext: cachedContext,
                  copyBidContext: {
                    copiedBidCollateral: String(
                      bidRecord?.counterpartyCollateral ?? '0'
                    ),
                    increment: matched.order.increment ?? 1,
                  },
                  dedupeKey: bidDedupeKey,
                });
              })
              .catch(() => {
                // Validation threw — remove from in-flight so it can be retried
                validatingBidsRef.current.delete(bidDedupeKey);
              });
          } else {
            // No verifying contract or missing data — proceed without validation
            void triggerAutoBidSubmission({
              order: matched.order,
              source: 'copy_trade',
              auctionId,
              auctionContext: cachedContext,
              copyBidContext: {
                copiedBidCollateral: String(
                  bidRecord?.counterpartyCollateral ?? '0'
                ),
                increment: matched.order.increment ?? 1,
              },
              dedupeKey: bidDedupeKey,
            });
          }
        }
      });
    },
    [
      address,
      chainId,
      collateralTokenAddress,
      evaluateAutoBidReadiness,
      getOrderIndex,
      markBidProcessed,
      orders,
      predictionMarketAddress,
      pushLogEntry,
      tokenDecimals,
      triggerAutoBidSubmission,
    ]
  );

  const handleConditionMatches = useCallback(
    (entry: AuctionFeedMessage) => {
      const rawPredictions = resolveMessageField(
        entry?.data,
        'predictedOutcomes'
      );
      const predictedLegs = decodePredictedOutcomes(rawPredictions);
      if (predictedLegs.length === 0) {
        return;
      }

      // Extract auction context from auction.started message
      // Escrow uses different field names: predictor, predictorCollateral, predictorNonce
      const auctionId = entry.channel || null;
      const msgData = asMessageData(entry?.data);
      const resolverAddr = msgData?.resolver ?? msgData?.payload?.resolver;
      const predictorAddr = msgData?.predictor ?? msgData?.payload?.predictor;
      const predictorCollateralStr =
        msgData?.predictorCollateral ??
        msgData?.payload?.predictorCollateral ??
        '0';
      const predictedOutcomesArr = Array.isArray(rawPredictions)
        ? (rawPredictions as `0x${string}`[])
        : [];

      // Cache auction context for copy_trade to use when processing auction.bids
      if (
        auctionId &&
        predictedOutcomesArr.length > 0 &&
        resolverAddr &&
        predictorAddr
      ) {
        // Extract escrowPicks from auction message if available
        const rawEscrowPicks =
          msgData?.escrowPicks ?? msgData?.payload?.escrowPicks;
        const ctx: AuctionContext = {
          predictedOutcomes: predictedOutcomesArr,
          resolver: resolverAddr as `0x${string}`,
          predictor: predictorAddr as `0x${string}`,
          predictorCollateral: predictorCollateralStr,
          ...(Array.isArray(rawEscrowPicks) &&
            rawEscrowPicks.length > 0 && { escrowPicks: rawEscrowPicks }),
        };
        auctionContextCacheRef.current.set(auctionId, ctx);
        auctionContextKeysRef.current.push(auctionId);
        // Evict oldest entries if cache exceeds limit
        while (auctionContextKeysRef.current.length > MAX_AUCTION_CACHE_SIZE) {
          const oldest = auctionContextKeysRef.current.shift();
          if (oldest) auctionContextCacheRef.current.delete(oldest);
        }
      }

      // Guard: never bid against your own auction (prevents self-outbidding)
      const normalizedSelf = normalizeAddress(address ?? null);
      const normalizedPredictor = normalizeAddress(predictorAddr ?? null);
      if (
        normalizedSelf &&
        normalizedPredictor &&
        normalizedSelf === normalizedPredictor
      ) {
        return;
      }

      const activeConditionOrders = orders.filter(
        (order) =>
          order.strategy === 'conditions' &&
          order.status === 'active' &&
          (order.conditionSelections?.length ?? 0) > 0
      );
      if (activeConditionOrders.length === 0) {
        return;
      }
      activeConditionOrders.forEach((order) => {
        const matchInfo = getConditionMatchInfo(order, predictedLegs);
        if (!matchInfo) {
          return;
        }
        const tag = formatOrderTag(order, null, getOrderIndex);
        // For conditions strategy, calculate estimated spend based on probability threshold
        // Formula: counterpartyCollateral = (probability * predictorCollateral) / (1 - probability)
        let estimatedSpend = 1;
        try {
          const probability = (order.odds ?? 50) / 100;
          if (probability > 0 && probability < 1) {
            const predictorCollateralNum = Number(
              formatUnits(BigInt(predictorCollateralStr || '0'), tokenDecimals)
            );
            if (
              Number.isFinite(predictorCollateralNum) &&
              predictorCollateralNum > 0
            ) {
              estimatedSpend =
                (probability * predictorCollateralNum) / (1 - probability);
            }
          }
        } catch {
          // Fallback to default
        }
        // Create a unique key for this bid to prevent duplicate submissions
        const bidDedupeKey = `conditions:${order.id}:${auctionId}:${matchInfo.inverted ? 'inv' : 'dir'}`;

        // Skip if we've already processed this exact bid for this order
        if (processedBidsRef.current.has(bidDedupeKey)) {
          return;
        }

        const readiness = evaluateAutoBidReadiness({
          order,
          context: {
            kind: 'conditions',
            summary: tag,
            auctionId,
            estimatedSpend,
            dedupeSuffix: matchInfo.inverted ? 'inv' : 'dir',
          },
        });
        if (!readiness.blocked) {
          // Fire and forget - dedupe key is marked on successful signature
          // Extract escrowPicks from the auction message
          const conditionMsgData = asMessageData(entry?.data);
          const conditionEscrowPicks =
            conditionMsgData?.escrowPicks ??
            conditionMsgData?.payload?.escrowPicks;
          void triggerAutoBidSubmission({
            order,
            source: 'conditions',
            inverted: matchInfo.inverted,
            auctionId,
            auctionContext: {
              predictorCollateral: predictorCollateralStr,
              predictor: predictorAddr as `0x${string}`,
              predictedOutcomes: predictedOutcomesArr,
              resolver: resolverAddr as `0x${string}`,
              ...(Array.isArray(conditionEscrowPicks) &&
                conditionEscrowPicks.length > 0 && {
                  escrowPicks: conditionEscrowPicks,
                }),
            },
            dedupeKey: bidDedupeKey,
          });
        }
      });
    },
    [
      address,
      evaluateAutoBidReadiness,
      getOrderIndex,
      orders,
      tokenDecimals,
      triggerAutoBidSubmission,
    ]
  );

  const handleAuctionMessage = useCallback(
    (entry: AuctionFeedMessage) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.type === 'auction.bids') {
        handleCopyTradeMatches(entry);
      } else if (entry.type === 'auction.started') {
        handleConditionMatches(entry);
      }
    },
    [handleConditionMatches, handleCopyTradeMatches]
  );

  // Process auction messages
  useEffect(() => {
    if (!auctionMessages || auctionMessages.length === 0) {
      return;
    }
    for (const entry of auctionMessages) {
      const key = typeof entry?.time === 'number' ? entry.time : null;
      if (key == null) continue;
      if (processedMessageIdsRef.current.has(key)) {
        continue;
      }
      processedMessageIdsRef.current.add(key);
      processedMessageQueueRef.current.push(key);
      if (processedMessageQueueRef.current.length > MAX_PROCESSED_MESSAGES) {
        const oldest = processedMessageQueueRef.current.shift();
        if (oldest != null) {
          processedMessageIdsRef.current.delete(oldest);
        }
      }
      handleAuctionMessage(entry);
    }
  }, [auctionMessages, handleAuctionMessage]);

  return {
    evaluateAutoBidReadiness,
    triggerAutoBidSubmission,
    handleCopyTradeMatches,
    handleConditionMatches,
    handleAuctionMessage,
  };
}
