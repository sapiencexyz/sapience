'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useSignMessage, useSignTypedData } from 'wagmi';
import {
  createAuctionStartSiweMessage,
  extractSiweDomainAndUri,
  type AuctionStartSigningPayload,
} from '@sapience/sdk';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types';
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
  // Escrow auction fields (optional)
  counterpartyCollateral?: string; // wei string - counterparty's collateral for escrow auctions
  escrowPicks?: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
}

export interface QuoteBid {
  auctionId: string;
  maker: string;
  makerCollateral: string; // wei
  makerDeadline: number; // unix seconds
  makerSignature: string; // Maker's bid signature
  makerNonce: number; // nonce for the maker
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
  // Escrow picks array (used directly instead of decoding from encodedPredictedOutcomes)
  // This ensures the predictor signs the exact same picks the counterparty signed
  escrowPicks?: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
  // Escrow: Session key data for counterparty (base64 encoded)
  counterpartySessionKeyData?: string;
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
  const logWarn = shouldLog ? logAuctionWarn : () => {};
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const inflightRef = useRef<string>('');
  // `apiBaseUrl` is the auction relayer base URL (http(s), typically includes `/auction`)
  const { apiBaseUrl } = useSettings();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { address: walletAddress } = useAccount();
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

          const rawBids = Array.isArray(data.payload?.bids)
            ? (data.payload.bids as any[])
            : [];

          const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
          // Support both V1 (maker*) and escrow (counterparty*) field names
          const normalized: QuoteBid[] = rawBids
            .map((b): QuoteBid | null => {
              try {
                return {
                  auctionId: b.auctionId || targetAuctionId,
                  maker: b.maker || b.counterparty || ZERO_ADDRESS,
                  makerCollateral:
                    b.makerCollateral || b.counterpartyCollateral || '0',
                  makerDeadline:
                    b.makerDeadline || b.counterpartyDeadline || 0,
                  makerSignature:
                    b.makerSignature || b.counterpartySignature || '0x',
                  makerNonce: b.makerNonce || b.counterpartyNonce || 0,
                  // Store escrow-specific fields for later use in mint request
                  counterpartySessionKeyData: b.counterpartySessionKeyData,
                } as QuoteBid;
              } catch {
                return null;
              }
            })
            .filter((b): b is QuoteBid => b !== null);
          // Set bids BEFORE logging so logging errors can never block state updates
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

      // Determine if we'll use session signing or wallet signing
      // Session signing: use smart account address as taker
      // Wallet signing: use wallet address as taker (signature must match taker for verification)
      const willUseSessionSigning = isUsingSmartAccount && !!sessionSignMessage;
      const effectiveTaker = willUseSessionSigning
        ? (effectiveAddress ?? params.taker)
        : (walletAddress ?? params.taker);

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

            // Use session key signing when using smart account with active session
            // Otherwise fall back to owner's wallet signing
            if (willUseSessionSigning) {
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
          // Add session approval data ONLY when actually using session signing
          // This tells the relayer to verify via smart account (EIP-1271) vs EOA (ecrecover)
          ...(willUseSessionSigning && etherealSessionApproval
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

        // Check if this is an escrow auction (has escrowPicks)
        const isEscrowAuction = params.escrowPicks && params.escrowPicks.length > 0;

        if (isEscrowAuction) {
          // Escrow Auction Start - no signature needed at start time
          // Predictor signs when accepting a specific bid (which includes counterpartyCollateral)
          try {
            const chainId = params.chainId;

            // Convert escrowPicks to Pick[] and canonicalize
            const rawPicks: Pick[] = params.escrowPicks!.map((p) => ({
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome,
            }));
            const picks = canonicalizePicks(rawPicks);

            // Calculate deadline (5 minutes from now)
            const nowSec = Math.floor(Date.now() / 1000);
            const predictorDeadline = nowSec + 300;

            // Build escrow auction payload - no signature at start time
            // Counterparty will specify their collateral in their bid
            const escrowPayload = {
              picks: picks.map((p) => ({
                conditionResolver: p.conditionResolver,
                conditionId: p.conditionId,
                predictedOutcome: p.predictedOutcome,
              })),
              predictorCollateral: params.wager,
              predictor: effectiveTaker,
              predictorNonce: params.takerNonce,
              predictorDeadline,
              chainId,
              // Note: no predictorSignature or counterpartyCollateral at auction start
              // Predictor signs when accepting a bid with specific counterpartyCollateral
            };

            // Send escrow auction start
            const escrowResponse = await client.sendWithAck<{
              auctionId?: string;
              error?: string;
            }>('auction.start', escrowPayload, { timeoutMs: 10000 });

            if (escrowResponse?.error) {
              console.error('[Escrow Auction] Start failed:', escrowResponse.error);
              inflightRef.current = '';
              return;
            }

            const newId = escrowResponse?.auctionId || null;
            latestAuctionIdRef.current = newId;
            loggedStaleAuctionsRef.current.clear();
            setAuctionId(newId);
            log(
              `[escrow] Auction started: id=${newId?.slice(0, 8)}, latestRef=${latestAuctionIdRef.current?.slice(0, 8)}, escrowPicks=${params.escrowPicks?.length}`
            );

            // Subscribe to escrow auction updates
            if (newId) {
              client.send({
                type: 'auction.subscribe',
                payload: { auctionId: newId },
              });
            }

            inflightRef.current = '';
            return;
          } catch (escrowError) {
            console.error('[Escrow Auction] Start error:', escrowError);
            inflightRef.current = '';
            return;
          }
        } else {
          // V1 Auction Start (original logic)
          log(
            `Requesting quotes: wager=${params.wager} wei, predictions=${params.predictedOutcomes.length}, taker=${effectiveTaker.slice(0, 10)}...`
          );

          try {
            const response = await client.sendWithAck<{ auctionId?: string }>(
              'auction.start',
              payloadWithSignature,
              { timeoutMs: 10000 }
            );

            // Only update state if this is still the latest request
            if (pendingRequestIdRef.current !== thisRequestId) {
              log(
                `Ignoring response for stale request (newer request completed)`
              );
              return;
            }

            const newId = response?.auctionId || null;
            latestAuctionIdRef.current = newId;
            loggedStaleAuctionsRef.current.clear();
            setAuctionId(newId);
            log(`Auction started: id=${newId}`);

            // Also subscribe to auction updates for this auctionId
            // This enables receiving escrow bids on the same auction
            if (newId) {
              client.send({
                type: 'auction.subscribe',
                payload: { auctionId: newId },
              });
            }
          } catch (err) {
            // Only update state if this is still the latest request
            if (pendingRequestIdRef.current === thisRequestId) {
              inflightRef.current = '';
              pendingRequestIdRef.current = null;
            }
            log(`Auction request failed:`, err);
          }
        }
      }, 400);
    },
    [
      wsUrl,
      signMessageAsync,
      signTypedDataAsync,
      isUsingSmartAccount,
      effectiveAddress,
      walletAddress,
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
      // Escrow uses counterparty* fields instead of maker* fields for bidder
      const bid = args.selectedBid;
      // Cast to access escrow fields if present
      const escrowBid = bid as unknown as Partial<EscrowQuoteBid>;
      return {
        encodedPredictedOutcomes: predictedOutcomes[0],
        resolver,
        makerCollateral: auction.wager,
        // Escrow bids have counterpartyCollateral, V1 bids have makerCollateral
        takerCollateral: escrowBid.counterpartyCollateral ?? bid.makerCollateral,
        maker: auction.taker,
        // Escrow bids have counterparty, V1 bids have maker
        taker: (escrowBid.counterparty ?? bid.maker) as `0x${string}`,
        // Escrow bids have counterpartySignature, V1 bids have makerSignature
        takerSignature: (escrowBid.counterpartySignature ??
          bid.makerSignature) as `0x${string}`,
        // Escrow bids have counterpartyDeadline, V1 bids have makerDeadline
        takerDeadline: String(escrowBid.counterpartyDeadline ?? bid.makerDeadline),
        refCode: (args.refCode ?? ZERO_BYTES32) as `0x${string}`,
        makerNonce: String(auction.takerNonce),
        // Escrow bids have counterpartyNonce, V1 bids have makerNonce
        takerClaimedNonce: escrowBid.counterpartyNonce ?? bid.makerNonce,
        // Escrow fields: include picks array if available
        escrowPicks: auction.escrowPicks,
        // Escrow fields: include counterparty session key data from bid
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
