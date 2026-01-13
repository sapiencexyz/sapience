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

export interface AuctionParams {
  wager: string; // wei string - taker's wager amount
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

function jsonStableStringify(value: unknown) {
  // Deep-stable stringify: sorts object keys at every level
  const serialize = (val: unknown): unknown => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return (val as unknown[]).map(serialize);
    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = serialize(obj[key]);
    }
    return out;
  };
  return JSON.stringify(serialize(value));
}

export function useAuctionStart() {
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const inflightRef = useRef<string>('');
  // `apiBaseUrl` is the auction relayer base URL (http(s), typically includes `/auction`)
  const { apiBaseUrl } = useSettings();
  const { signMessageAsync } = useSignMessage();
  const {
    isSessionActive,
    smartAccountAddress,
    etherealSessionApproval,
    signMessage: sessionSignMessage,
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
          if (targetAuctionId !== latestAuctionIdRef.current) return;
          const normalized: QuoteBid[] = rawBids
            .map((b) => {
              try {
                const auctionIdVal: string =
                  b.auctionId || latestAuctionIdRef.current || '';
                const maker: string =
                  b.maker || '0x0000000000000000000000000000000000000000';
                const makerWager: string = b.makerWager || '0';
                const makerDeadline: number = b.makerDeadline || 0;

                return {
                  auctionId: auctionIdVal,
                  maker,
                  makerWager,
                  makerDeadline,
                  makerSignature: b.makerSignature || '0x',
                  makerNonce: b.makerNonce || 0,
                } as QuoteBid;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as QuoteBid[];
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

      // Use smart account address as taker when session is active
      const effectiveTaker =
        isSessionActive && smartAccountAddress
          ? smartAccountAddress
          : params.taker;

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

            // Use session key signing when session is active (no wallet popup)
            // Otherwise fall back to owner's wallet signing
            if (isSessionActive && sessionSignMessage) {
              takerSignature = await sessionSignMessage(message);
              if (process.env.NODE_ENV !== 'production') {
                console.debug(
                  '[AuctionStart] Generated SIWE signature with session key'
                );
              }
            } else {
              takerSignature = await signMessageAsync({ message });
              if (process.env.NODE_ENV !== 'production') {
                console.debug(
                  '[AuctionStart] Generated SIWE signature with wallet'
                );
              }
            }
            takerSignedAt = issuedAt;
          } catch (signError) {
            // If signature is required and fails, log and return early
            console.warn(
              '[AuctionStart] Failed to sign auction request:',
              signError
            );
            return;
          }
        }

        // Add signature and timestamp to request payload if available
        let payloadWithSignature: Record<string, unknown> =
          takerSignature && takerSignedAt
            ? {
                ...requestPayload,
                takerSignature,
                takerSignedAt,
              }
            : requestPayload;

        // Add session approval data for smart account authentication
        // This allows the relayer to verify ownership without additional RPC calls
        // Note: The session key is extracted from validatorData in the typed data (cryptographically signed by owner)
        if (isSessionActive && etherealSessionApproval) {
          payloadWithSignature = {
            ...payloadWithSignature,
            sessionApproval: etherealSessionApproval.approval,
            sessionTypedData: etherealSessionApproval.typedData,
          };
          if (process.env.NODE_ENV !== 'production') {
            console.debug(
              '[AuctionStart] Including session approval for smart account auth'
            );
          }
        }

        // Clear previous auction state
        inflightRef.current = key;
        latestAuctionIdRef.current = null; // Clear so we don't process stale bids
        setAuctionId(null);
        setBids([]);
        // Store params with effectiveTaker so buildMintRequestDataFromBid uses the correct address
        // (smart account address when session is active, otherwise EOA)
        lastAuctionRef.current = { ...params, taker: effectiveTaker };
        setCurrentAuctionParams({ ...params, taker: effectiveTaker });

        // Use sendWithAck for proper request/response correlation
        // Server echoes back the request ID, allowing parallel requests
        try {
          const response = await client.sendWithAck<{ auctionId?: string }>(
            'auction.start',
            payloadWithSignature,
            { timeoutMs: 10000 }
          );
          const newId = response?.auctionId || null;
          latestAuctionIdRef.current = newId;
          setAuctionId(newId);
        } catch (err) {
          // On timeout or error, clear inflight but keep params for retry
          inflightRef.current = '';
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[AuctionStart] sendWithAck failed:', err);
          }
        }
      }, 400);
    },
    [
      wsUrl,
      signMessageAsync,
      isSessionActive,
      smartAccountAddress,
      etherealSessionApproval,
      sessionSignMessage,
    ]
  );

  const acceptBid = useCallback(
    (txHashOfSubmit?: string) => {
      // Stub for now: submit directly to mint via app flow; emulate success
      if (!auctionId) throw new Error('auction_not_initialized');
      return Promise.resolve({
        status: 'submitted',
        relayTxHash: txHashOfSubmit || null,
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

      try {
        const zeroBytes32 = `0x${'0'.repeat(64)}`;
        const resolver = auction.resolver as `0x${string}`;
        const predictedOutcomes = auction.predictedOutcomes as `0x${string}`[];
        if (!resolver || predictedOutcomes.length === 0) return null;

        // Validate bid is from the current auction to avoid stale nonce errors
        if (args.selectedBid.auctionId !== auctionId) {
          console.error('[useAuctionStart] Stale bid - auctionId mismatch', {
            bidAuctionId: args.selectedBid.auctionId,
            currentAuctionId: auctionId,
          });
          return null;
        }

        console.debug('[useAuctionStart] buildMintRequestDataFromBid:', {
          selectedBidMaker: args.selectedBid.maker,
          selectedBidMakerWager: args.selectedBid.makerWager,
          selectedBidMakerSignature: args.selectedBid.makerSignature?.slice(0, 20) + '...',
          selectedBidMakerDeadline: args.selectedBid.makerDeadline,
          selectedBidMakerNonce: args.selectedBid.makerNonce,
          selectedBidAuctionId: args.selectedBid.auctionId,
          auctionTaker: auction.taker,
          auctionWager: auction.wager,
          auctionTakerNonce: auction.takerNonce,
        });

        // Contract field names haven't changed - map BID (API) roles to contract roles:
        // Contract "maker" = API "taker" (auction creator)
        // Contract "taker" = API "maker" (bidder)
        return {
          encodedPredictedOutcomes: predictedOutcomes[0],
          resolver,
          makerCollateral: auction.wager, // Contract maker = API taker (auction creator's wager)
          takerCollateral: args.selectedBid.makerWager, // Contract taker = API maker (bidder's wager)
          maker: auction.taker, // Contract maker = API taker (auction creator) - should be smart account when session active
          taker: args.selectedBid.maker as `0x${string}`, // Contract taker = API maker (bidder)
          takerSignature: args.selectedBid.makerSignature as `0x${string}`, // Contract taker = API maker (bidder's signature)
          takerDeadline: String(args.selectedBid.makerDeadline), // Contract taker = API maker (bidder's deadline)
          refCode: args.refCode || (zeroBytes32 as `0x${string}`),
          makerNonce: String(auction.takerNonce), // Contract maker = API taker (auction creator's nonce)
          takerClaimedNonce: args.selectedBid.makerNonce, // Bidder's claimed nonce for validation
        };
      } catch {
        return null;
      }
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
