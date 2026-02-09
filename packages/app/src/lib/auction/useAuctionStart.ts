'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignMessage } from 'wagmi';
import {
  createAuctionStartSiweMessage,
  extractSiweDomainAndUri,
  type AuctionStartSigningPayload,
} from '@sapience/sdk';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import {
  logAuction,
  logAuctionWarn,
  formatBidForLog,
} from '~/lib/auction/bidLogger';

export interface AuctionParams {
  wager: string; // wei string - taker's position size
  resolver: string; // contract address for market validation
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  taker: `0x${string}`; // taker EOA address
  takerNonce: number; // nonce for the taker
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
}

export interface QuoteBid {
  auctionId: string;
  maker: string;
  makerWager: string; // wei
  makerDeadline: number; // unix seconds
  makerSignature: string; // Maker's bid signature
  makerNonce: number; // nonce for the maker
  /** Client-side validity marker for UI display/filtering */
  validationStatus?: 'pending' | 'valid' | 'invalid';
  /** Optional reason when validationStatus === 'invalid' */
  validationError?: string;
}

// Struct shape expected by PredictionMarket.mint()
// @dev notice that this interface follows contract field names, not API field names
// Contract "maker" = API "taker" (auction creator)
// Contract "taker" = API "maker" (bidder)
export interface MintPredictionRequestData {
  encodedPredictedOutcomes: `0x${string}`; // single bytes per contract
  resolver: `0x${string}`;
  makerCollateral: string; // wei
  takerCollateral: string; // wei
  maker: `0x${string}`;
  taker: `0x${string}`;
  // Optional here; the submit hook will fetch and inject the correct nonce
  makerNonce?: string | bigint;
  takerSignature: `0x${string}`; // taker approval for this prediction (off-chain)
  takerDeadline: string; // unix seconds (uint256 string)
  refCode: `0x${string}`; // bytes32
  // For validation: the nonce the bidder (contract taker) claimed when signing
  // This is embedded in their signature and must match their on-chain nonce
  takerClaimedNonce?: number;
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
  const logWarn = shouldLog ? logAuctionWarn : () => {};
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const inflightRef = useRef<string>('');
  // `apiBaseUrl` is the auction relayer base URL (http(s), typically includes `/auction`)
  const { apiBaseUrl } = useSettings();
  const { signMessageAsync } = useSignMessage();
  const {
    etherealSessionApproval,
    signMessage: sessionSignMessage,
    effectiveAddress,
    isUsingSmartAccount,
  } = useSession();
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
  // Track the current pending request to handle race conditions
  // When a new request is made, we generate a unique ID. Only the response
  // matching the latest request ID will update the auction state.
  const pendingRequestIdRef = useRef<string | null>(null);
  const [currentAuctionParams, setCurrentAuctionParams] =
    useState<AuctionParams | null>(null);

  // Set up message listener on the shared client for bids only
  // auction.ack is handled via sendWithAck for proper request/response correlation
  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);

    const handleMessage = (msg: unknown) => {
      try {
        const data = msg as { type?: string; payload?: any };

        if (data?.type === 'auction.bids') {
          const rawBids = Array.isArray(data.payload?.bids)
            ? (data.payload.bids as any[])
            : [];
          // Only accept bids for OUR auction id
          const targetAuctionId: string | null =
            rawBids.length > 0 ? rawBids[0]?.auctionId || null : null;

          if (!targetAuctionId) return;
          // Filter: only process if this is for our current auction
          if (targetAuctionId !== latestAuctionIdRef.current) {
            // Only log once per stale auction ID to reduce noise
            // (ExampleCombos creates multiple auctions that would spam logs)
            if (!loggedStaleAuctionsRef.current.has(targetAuctionId)) {
              loggedStaleAuctionsRef.current.add(targetAuctionId);
              log(
                `Ignoring bids for stale auction ${targetAuctionId} (current: ${latestAuctionIdRef.current})`
              );
            }
            return;
          }

          log(
            `Received batch of ${rawBids.length} bid(s) for auction ${targetAuctionId}`
          );
          rawBids.forEach((b) => {
            log(`  - ${formatBidForLog(b)}`);
          });
          const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
          const normalized: QuoteBid[] = rawBids
            .map((b): QuoteBid | null => {
              try {
                return {
                  auctionId: b.auctionId || latestAuctionIdRef.current || '',
                  maker: b.maker || ZERO_ADDRESS,
                  makerWager: b.makerWager || '0',
                  makerDeadline: b.makerDeadline || 0,
                  makerSignature: b.makerSignature || '0x',
                  makerNonce: b.makerNonce || 0,
                };
              } catch {
                return null;
              }
            })
            .filter((b): b is QuoteBid => b !== null);
          setBids(normalized);
        }
        // auction.ack handled via sendWithAck
        // auction.started is handled elsewhere (noop here)
      } catch {
        // ignore
      }
    };

    const offMessage = client.addMessageListener(handleMessage);

    return () => {
      offMessage();
    };
  }, [wsUrl]);

  // Debounced send of auction.start when params change
  const debounceTimer = useRef<number | null>(null);
  const requestQuotes = useCallback(
    (
      params: AuctionParams | null,
      options?: { forceRefresh?: boolean; requireSignature?: boolean }
    ) => {
      if (!params || !wsUrl) return;

      // Use effectiveAddress from session context if available, otherwise use params.taker
      const effectiveTaker = effectiveAddress ?? params.taker;

      const requestPayload = {
        wager: params.wager,
        resolver: params.resolver,
        predictedOutcomes: params.predictedOutcomes,
        taker: effectiveTaker,
        takerNonce: params.takerNonce,
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

      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(async () => {
        const client = getSharedAuctionWsClient(wsUrl);

        // Generate a unique request ID to track this specific request
        // This prevents race conditions where a newer request's response
        // would be overwritten by an older request completing later
        const thisRequestId = crypto.randomUUID();
        pendingRequestIdRef.current = thisRequestId;

        // Generate SIWE signature for the auction request if required
        let takerSignature: string | undefined;
        let takerSignedAt: string | undefined;
        const requireSignature = options?.requireSignature ?? true; // Default to true to ask for signature as default behavior

        if (requireSignature) {
          try {
            const { domain, uri } = extractSiweDomainAndUri(wsUrl);
            const issuedAt = new Date().toISOString();

            const signingPayload: AuctionStartSigningPayload = {
              wager: params.wager,
              predictedOutcomes: params.predictedOutcomes,
              resolver: params.resolver,
              taker: effectiveTaker,
              takerNonce: params.takerNonce,
              chainId: params.chainId,
            };
            const message = createAuctionStartSiweMessage(
              signingPayload,
              domain,
              uri,
              issuedAt
            );

            // Use session key signing when using smart account (no wallet popup)
            // Otherwise fall back to owner's wallet signing
            if (isUsingSmartAccount && sessionSignMessage) {
              takerSignature = await sessionSignMessage(message);
            } else {
              takerSignature = await signMessageAsync({ message });
            }
            takerSignedAt = issuedAt;
          } catch (signError) {
            // If signature is required and fails, log and return early
            logWarn('Failed to sign auction request:', signError);
            // Clear pending request since we're aborting
            if (pendingRequestIdRef.current === thisRequestId) {
              pendingRequestIdRef.current = null;
            }
            return;
          }
        }

        // Check if a newer request was made while we were signing
        // If so, abort this request to avoid race conditions
        if (pendingRequestIdRef.current !== thisRequestId) {
          log('Aborting stale request (newer request in progress)');
          return;
        }

        // Build final payload with signature and session data
        const payloadWithSignature: Record<string, unknown> = {
          ...requestPayload,
          ...(takerSignature && takerSignedAt
            ? { takerSignature, takerSignedAt }
            : {}),
          // Add session approval data for smart account authentication (only when using smart account)
          ...(isUsingSmartAccount && etherealSessionApproval
            ? {
                sessionApproval: etherealSessionApproval.approval,
                sessionTypedData: etherealSessionApproval.typedData,
              }
            : {}),
        };

        // Update inflight tracking and clear bids for new request
        // NOTE: We intentionally do NOT clear latestAuctionIdRef here.
        // Setting it to null would cause bids for the current auction to be
        // rejected as "stale" while we wait for the server response.
        // Instead, we only update latestAuctionIdRef when we receive the
        // new auction ID from the server.
        inflightRef.current = key;
        setBids([]);
        // Store params with effectiveTaker so buildMintRequestDataFromBid uses the correct address
        // (smart account address when session is active, otherwise EOA)
        lastAuctionRef.current = { ...params, taker: effectiveTaker };
        setCurrentAuctionParams({ ...params, taker: effectiveTaker });

        log(
          `Requesting quotes: wager=${params.wager} wei, predictions=${params.predictedOutcomes.length}, taker=${effectiveTaker.slice(0, 10)}...`
        );

        // Use sendWithAck for proper request/response correlation
        // Server echoes back the request ID, allowing parallel requests
        try {
          const response = await client.sendWithAck<{ auctionId?: string }>(
            'auction.start',
            payloadWithSignature,
            { timeoutMs: 10000 }
          );

          // Only update state if this is still the latest request
          // A newer request may have been made while we were awaiting
          if (pendingRequestIdRef.current !== thisRequestId) {
            log(
              `Ignoring response for stale request (newer request completed)`
            );
            return;
          }

          const newId = response?.auctionId || null;
          latestAuctionIdRef.current = newId;
          // Clear logged stale auctions when a new auction starts
          loggedStaleAuctionsRef.current.clear();
          setAuctionId(newId);
          log(`Auction started: id=${newId}`);
        } catch (err) {
          // Only update state if this is still the latest request
          if (pendingRequestIdRef.current === thisRequestId) {
            // On timeout or error, clear inflight but keep params for retry
            inflightRef.current = '';
            pendingRequestIdRef.current = null;
          }
          log(`Auction request failed:`, err);
        }
      }, 400);
    },
    [
      wsUrl,
      signMessageAsync,
      isUsingSmartAccount,
      effectiveAddress,
      etherealSessionApproval,
      sessionSignMessage,
    ]
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
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
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

      const resolver = auction.resolver as `0x${string}`;
      const predictedOutcomes = auction.predictedOutcomes as `0x${string}`[];
      if (!resolver || predictedOutcomes.length === 0) return null;

      // Validate bid is from the current auction to avoid stale nonce errors
      if (args.selectedBid.auctionId !== auctionId) {
        log(
          `Stale bid rejected - auctionId mismatch: bid=${args.selectedBid.auctionId}, current=${auctionId}`
        );
        return null;
      }

      const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

      // Contract field names map BID (API) roles to contract roles:
      // Contract "maker" = API "taker" (auction creator)
      // Contract "taker" = API "maker" (bidder)
      return {
        encodedPredictedOutcomes: predictedOutcomes[0],
        resolver,
        makerCollateral: auction.wager,
        takerCollateral: args.selectedBid.makerWager,
        maker: auction.taker,
        taker: args.selectedBid.maker as `0x${string}`,
        takerSignature: args.selectedBid.makerSignature as `0x${string}`,
        takerDeadline: String(args.selectedBid.makerDeadline),
        refCode: (args.refCode ?? ZERO_BYTES32) as `0x${string}`,
        makerNonce: String(auction.takerNonce),
        takerClaimedNonce: args.selectedBid.makerNonce,
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
