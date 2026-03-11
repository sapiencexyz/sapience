'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { logAuction, formatBidForLog } from '~/lib/auction/bidLogger';

export interface AuctionParams {
  wager: string; // wei string - predictor's position size
  resolver: string; // contract address for market validation
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  predictor: `0x${string}`; // predictor EOA address
  predictorNonce: number; // nonce for the predictor
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
  // Escrow auction fields (optional)
  counterpartyCollateral?: string; // wei string - counterparty's collateral for escrow auctions
  escrowPicks?: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
  predictorDeadline?: number; // unix seconds — computed internally at auction start
  // Sponsorship fields (threaded to counterparty so their signature includes the sponsor)
  predictorSponsor?: `0x${string}`;
  predictorSponsorData?: `0x${string}`;
}

export interface QuoteBid {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string; // wei
  counterpartyDeadline: number; // unix seconds
  counterpartySignature: string; // Counterparty's bid signature
  counterpartyNonce: number; // nonce for the counterparty
  /** Client-side validity marker for UI display/filtering */
  validationStatus?: 'pending' | 'valid' | 'invalid';
  /** Optional reason when validationStatus === 'invalid' */
  validationError?: string;
  /** Escrow: Session key data for counterparty (base64 encoded) */
  counterpartySessionKeyData?: string;
}

// Escrow bid fields (counterparty = bidder in escrow terminology)
export interface EscrowQuoteBid {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string; // wei
  counterpartyDeadline: number; // unix seconds
  counterpartySignature: string; // Counterparty's bid signature
  counterpartyNonce: number; // nonce for the counterparty
  counterpartySessionKeyData?: string;
}

// Struct shape expected by PredictionMarketEscrow.mint()
export interface MintPredictionRequestData {
  predictorCollateral: string; // wei
  counterpartyCollateral: string; // wei
  predictor: `0x${string}`;
  counterparty: `0x${string}`;
  // Optional here; the submit hook will fetch and inject the correct nonce
  predictorNonce?: string | bigint;
  counterpartySignature: `0x${string}`; // counterparty approval for this prediction (off-chain)
  counterpartyDeadline: string; // unix seconds (uint256 string)
  predictorDeadline: string; // unix seconds (uint256 string) — from auction start
  refCode: `0x${string}`; // bytes32
  // The nonce the counterparty (bidder) claimed when signing
  // This is embedded in their signature and must match their on-chain nonce
  counterpartyClaimedNonce?: number;
  // Picks array — the predictor signs the exact same picks the counterparty signed
  picks: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
  // Session key data for counterparty (base64 encoded)
  counterpartySessionKeyData?: string;
  // Session key data for predictor (ABI-encoded)
  predictorSessionKeyData?: string;
  // Predictor's EIP-712 MintApproval signature (populated at submit time for escrow mints)
  predictorSignature?: `0x${string}`;
  // Sponsorship: OnboardingSponsor contract address (address(0) = self-funded)
  predictorSponsor?: `0x${string}`;
  // Sponsorship: opaque data passed to sponsor's fundMint (empty bytes if unused)
  predictorSponsorData?: `0x${string}`;
}

function jsonStableStringify(value: unknown): string {
  const serialize = (val: unknown): unknown => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(serialize);

    const obj = val as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = serialize(obj[key]);
    }
    return sorted;
  };
  return JSON.stringify(serialize(value));
}

export interface UseAuctionStartOptions {
  /** Disable logging for this hook instance (use for forecast-only components) */
  disableLogging?: boolean;
}

export function useAuctionStart(options?: UseAuctionStartOptions) {
  const shouldLog = !options?.disableLogging;
  // Create conditional log functions to avoid noisy logs from forecast-only components
  const log = shouldLog ? logAuction : () => {};
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const inflightRef = useRef<string>('');
  // `apiBaseUrl` is the auction relayer base URL (http(s), typically includes `/auction`)
  const { apiBaseUrl } = useSettings();
  const { address: walletAddress } = useAccount();
  const {
    etherealSessionApproval,
    signMessage: sessionSignMessage,
    effectiveAddress,
    isUsingSmartAccount,
  } = useSession();

  // Stable refs for session state — read at call time, don't trigger requestQuotes recreation
  const effectiveAddressRef = useRef(effectiveAddress);
  const etherealSessionApprovalRef = useRef(etherealSessionApproval);
  const sessionSignMessageRef = useRef(sessionSignMessage);
  const isUsingSmartAccountRef = useRef(isUsingSmartAccount);

  useEffect(() => {
    effectiveAddressRef.current = effectiveAddress;
  }, [effectiveAddress]);
  useEffect(() => {
    etherealSessionApprovalRef.current = etherealSessionApproval;
  }, [etherealSessionApproval]);
  useEffect(() => {
    sessionSignMessageRef.current = sessionSignMessage;
  }, [sessionSignMessage]);
  useEffect(() => {
    isUsingSmartAccountRef.current = isUsingSmartAccount;
  }, [isUsingSmartAccount]);

  const relayerBase = useMemo(() => {
    if (apiBaseUrl && apiBaseUrl.length > 0) return apiBaseUrl;
    const explicitRelayer = process.env.NEXT_PUBLIC_FOIL_RELAYER_URL;
    const apiRoot =
      process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
    const root = explicitRelayer || apiRoot;
    try {
      const u = new URL(root);
      if (!explicitRelayer && u.hostname === 'api.sapience.xyz') {
        u.hostname = 'relayer.sapience.xyz';
      }
      return `${u.origin}/auction`;
    } catch {
      return `${root}/auction`;
    }
  }, [apiBaseUrl]);
  const wsUrl = useMemo(
    () => toAuctionWsUrl(relayerBase || undefined),
    [relayerBase]
  );
  const lastAuctionRef = useRef<AuctionParams | null>(null);
  // Track latest auctionId in a ref to avoid stale closures in ws handlers
  const latestAuctionIdRef = useRef<string | null>(null);
  // Track which stale auction IDs we've already logged to reduce noise
  // (ExampleCombos creates multiple auctions that trigger stale bid warnings)
  const loggedStaleAuctionsRef = useRef<Set<string>>(new Set());
  // Correlation ID for the latest auction.start message we sent.
  // Used by handleMessage to match ack responses to this hook instance
  // (each instance gets its own ID, so shared-WS cross-talk is filtered out).
  const sentMessageIdRef = useRef<string | null>(null);
  // Manual ack timeout (replaces sendWithAck's internal timeout)
  const ackTimeoutRef = useRef<number | null>(null);
  // Buffer bids that arrive before the auction.ack (fast quoter race).
  // Keyed by auctionId so we can replay them once the ack arrives.
  const pendingBidsRef = useRef<Map<string, QuoteBid[]>>(new Map());
  const [currentAuctionParams, setCurrentAuctionParams] =
    useState<AuctionParams | null>(null);

  // Set up message listener on the shared client for bids AND ack responses.
  // Acks are matched by the correlation ID we stored in sentMessageIdRef,
  // so each hook instance only processes its own ack (shared WS is filtered).
  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);

    const handleMessage = (msg: unknown) => {
      try {
        const data = msg as {
          type?: string;
          id?: string;
          payload?: any;
        };

        // ---------------------------------------------------------------
        // Handle ack response for our pending auction.start
        // This runs synchronously in the onmessage callback, so
        // latestAuctionIdRef is set BEFORE any subsequent bid message
        // fires — eliminates the bids-before-ack race entirely.
        // ---------------------------------------------------------------
        const msgId = String(data?.id || data?.payload?.id || '');
        if (msgId && msgId === sentMessageIdRef.current) {
          sentMessageIdRef.current = null;
          if (ackTimeoutRef.current) {
            window.clearTimeout(ackTimeoutRef.current);
            ackTimeoutRef.current = null;
          }

          if (data?.payload?.error) {
            console.error('[Escrow Auction] Start failed:', data.payload.error);
            inflightRef.current = '';
            pendingBidsRef.current.clear();
            return;
          }

          const newId = (data?.payload?.auctionId as string) || null;
          latestAuctionIdRef.current = newId;
          loggedStaleAuctionsRef.current.clear();
          setAuctionId(newId);

          // Replay bids that arrived before this ack (fast quoter race)
          if (newId && pendingBidsRef.current.has(newId)) {
            const buffered = pendingBidsRef.current.get(newId)!;
            log(
              `Replayed ${buffered.length} buffered bid(s) for auction ${newId.slice(0, 8)}`
            );
            setBids(buffered);
          }
          pendingBidsRef.current.clear();

          log(
            `[escrow] Auction started: id=${newId?.slice(0, 8)}, latestRef=${latestAuctionIdRef.current?.slice(0, 8)}`
          );

          // Subscribe to auction updates
          if (newId) {
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId: newId },
            });
          }

          inflightRef.current = '';
          return;
        }

        // ---------------------------------------------------------------
        // Handle auction.bids
        // ---------------------------------------------------------------
        if (data?.type === 'auction.bids') {
          const targetAuctionId =
            (data.payload?.auctionId as string | undefined) ||
            (Array.isArray(data.payload?.bids) && data.payload.bids.length > 0
              ? data.payload.bids[0]?.auctionId
              : null) ||
            null;

          log(
            `[handleMessage] auction.bids received: target=${targetAuctionId?.slice(0, 8)}, current=${latestAuctionIdRef.current?.slice(0, 8)}, bidCount=${Array.isArray(data.payload?.bids) ? data.payload.bids.length : 0}`
          );

          if (!targetAuctionId) return;

          const rawBids = Array.isArray(data.payload?.bids)
            ? (data.payload.bids as any[])
            : [];

          const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
          const normalized: QuoteBid[] = rawBids
            .map((b): QuoteBid | null => {
              try {
                return {
                  auctionId: b.auctionId || targetAuctionId,
                  counterparty: b.counterparty || ZERO_ADDRESS,
                  counterpartyCollateral: b.counterpartyCollateral || '0',
                  counterpartyDeadline: b.counterpartyDeadline || 0,
                  counterpartySignature: b.counterpartySignature || '0x',
                  counterpartyNonce: b.counterpartyNonce || 0,
                  counterpartySessionKeyData: b.counterpartySessionKeyData,
                } as QuoteBid;
              } catch {
                return null;
              }
            })
            .filter((b): b is QuoteBid => b !== null);

          // Filter: only process bids for our current auction.
          // If we're waiting for an ack, buffer them for replay.
          if (targetAuctionId !== latestAuctionIdRef.current) {
            if (sentMessageIdRef.current) {
              pendingBidsRef.current.set(targetAuctionId, normalized);
            } else if (!loggedStaleAuctionsRef.current.has(targetAuctionId)) {
              loggedStaleAuctionsRef.current.add(targetAuctionId);
              log(
                `Ignoring bids for stale auction ${targetAuctionId} (current: ${latestAuctionIdRef.current})`
              );
            }
            return;
          }

          setBids(normalized);
          log(
            `Received batch of ${rawBids.length} bid(s) for auction ${targetAuctionId}`
          );
          try {
            rawBids.forEach((b) => {
              log(`  - ${formatBidForLog(b)}`);
            });
          } catch {
            // Never let logging errors block bid processing
          }
        }
      } catch {
        // ignore
      }
    };

    const offMessage = client.addMessageListener(handleMessage);

    return () => {
      offMessage();
    };
  }, [wsUrl]);

  const requestQuotes = useCallback(
    (params: AuctionParams | null, options?: { forceRefresh?: boolean }) => {
      if (!params || !wsUrl) return;

      // Determine if we'll use session signing or wallet signing
      // Session signing: use smart account address as predictor
      // Wallet signing: use wallet address as predictor (signature must match predictor for verification)
      const willUseSessionSigning =
        isUsingSmartAccountRef.current && !!sessionSignMessageRef.current;
      const effectivePredictor = willUseSessionSigning
        ? (effectiveAddressRef.current ?? params.predictor)
        : (walletAddress ?? params.predictor);

      const requestPayload = {
        wager: params.wager,
        resolver: params.resolver,
        predictedOutcomes: params.predictedOutcomes,
        predictor: effectivePredictor,
        predictorNonce: params.predictorNonce,
        chainId: params.chainId,
      };

      const key = jsonStableStringify({
        type: 'auction.start',
        payload: requestPayload,
      });
      // Skip deduplication when forceRefresh is true (e.g., user clicked "Request Bids")
      if (inflightRef.current === key && !options?.forceRefresh) return;
      // Clear inflight key when forcing refresh to allow the new request
      if (options?.forceRefresh) inflightRef.current = '';

      const client = getSharedAuctionWsClient(wsUrl);

      // Update inflight tracking and clear bids for new request
      // Clear latestAuctionIdRef so bids from the previous auction are rejected.
      // New-auction bids arriving before the ack are buffered in pendingBidsRef
      // (keyed by auctionId) and replayed once the ack sets the new ID.
      inflightRef.current = key;
      latestAuctionIdRef.current = null;
      setBids([]);
      pendingBidsRef.current.clear();
      // Store params with effectivePredictor so buildMintRequestDataFromBid uses the correct address
      lastAuctionRef.current = { ...params, predictor: effectivePredictor };
      setCurrentAuctionParams({ ...params, predictor: effectivePredictor });

      // Check if this is an escrow auction (has escrowPicks)
      const isEscrowAuction =
        params.escrowPicks && params.escrowPicks.length > 0;

      if (!isEscrowAuction) {
        console.error(
          '[Auction] Escrow picks missing — all auctions require escrow format'
        );
        inflightRef.current = '';
        return;
      }

      const chainId = params.chainId;

      // Convert escrowPicks to Pick[] and canonicalize
      const rawPicks: Pick[] = params.escrowPicks!.map((p) => ({
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      }));
      const picks = canonicalizePicks(rawPicks);

      // Calculate deadline (30 seconds from now)
      const nowSec = Math.floor(Date.now() / 1000);
      const predictorDeadline = nowSec + 30;

      // Store predictorDeadline on the auction ref so buildMintRequestDataFromBid can access it
      lastAuctionRef.current = {
        ...lastAuctionRef.current,
        predictorDeadline,
      };

      const escrowPayload: Record<string, unknown> = {
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: params.wager,
        predictor: effectivePredictor,
        predictorNonce: params.predictorNonce,
        predictorDeadline,
        chainId,
      };
      if (params.predictorSponsor) {
        escrowPayload.predictorSponsor = params.predictorSponsor;
        escrowPayload.predictorSponsorData = params.predictorSponsorData ?? '0x';
      }

      // Generate a correlation ID and send via client.send() instead of
      // sendWithAck(). The ack is handled synchronously in handleMessage
      // (matched by this ID), which eliminates the microtask race where
      // bids arrive before the ack sets latestAuctionIdRef.
      const messageId = crypto.randomUUID();
      sentMessageIdRef.current = messageId;

      client.send({
        id: messageId,
        type: 'auction.start',
        payload: { ...escrowPayload, id: messageId },
      });

      // Manual ack timeout — if the relayer doesn't respond, clean up
      if (ackTimeoutRef.current) window.clearTimeout(ackTimeoutRef.current);
      ackTimeoutRef.current = window.setTimeout(() => {
        if (sentMessageIdRef.current !== messageId) return;
        sentMessageIdRef.current = null;
        log('[auction] ack timeout — no response from relayer');
        pendingBidsRef.current.clear();
        inflightRef.current = '';
      }, 10_000);
    },
    [wsUrl, walletAddress]
  );

  const acceptBid = useCallback(
    (txHashOfSubmit?: string) => {
      if (!auctionId) throw new Error('auction_not_initialized');
      return Promise.resolve({
        status: 'submitted' as const,
        relayTxHash: txHashOfSubmit ?? null,
      });
    },
    [auctionId]
  );

  const notifyOrderCreated = useCallback(
    (requestId: string, txHash?: string) => {
      if (!auctionId || !wsUrl) return;
      const client = getSharedAuctionWsClient(wsUrl);
      client.send({
        type: 'order.created',
        payload: { auctionId, requestId, txHash },
      });
    },
    [auctionId, wsUrl]
  );

  useEffect(
    () => () => {
      if (ackTimeoutRef.current) window.clearTimeout(ackTimeoutRef.current);
    },
    []
  );

  const buildMintRequestDataFromBid = useCallback(
    (args: {
      selectedBid: QuoteBid;
      refCode?: `0x${string}`;
    }): MintPredictionRequestData | null => {
      const auction = lastAuctionRef.current;
      if (!auction) return null;

      const picks = auction.escrowPicks;
      if (!picks || picks.length === 0) return null;

      // Validate bid is from the current auction to avoid stale nonce errors
      if (args.selectedBid.auctionId !== auctionId) {
        log(
          `Stale bid rejected - auctionId mismatch: bid=${args.selectedBid.auctionId}, current=${auctionId}`
        );
        return null;
      }

      const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

      const bid = args.selectedBid;
      return {
        predictorCollateral: auction.wager,
        counterpartyCollateral: bid.counterpartyCollateral,
        predictor: auction.predictor,
        counterparty: bid.counterparty as `0x${string}`,
        counterpartySignature: bid.counterpartySignature as `0x${string}`,
        counterpartyDeadline: String(bid.counterpartyDeadline),
        predictorDeadline: String(auction.predictorDeadline),
        refCode: (args.refCode ?? ZERO_BYTES32) as `0x${string}`,
        predictorNonce: String(auction.predictorNonce),
        counterpartyClaimedNonce: bid.counterpartyNonce,
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        counterpartySessionKeyData: bid.counterpartySessionKeyData,
      };
    },
    [auctionId]
  );

  return {
    auctionId,
    bids,
    requestQuotes,
    acceptBid,
    notifyOrderCreated,
    currentAuctionParams,
    buildMintRequestDataFromBid,
  };
}
