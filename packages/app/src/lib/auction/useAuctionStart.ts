'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import type { Hex } from 'viem';
import type { Pick } from '@sapience/sdk/types';
import {
  prepareAuctionRFQ,
  type SignableTypedData,
} from '@sapience/sdk/auction/initiate';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { logAuction, formatBidForLog } from '~/lib/auction/bidLogger';

export interface AuctionParams {
  wager: string; // wei string - predictor's position size
  predictor: `0x${string}`; // predictor EOA address
  predictorNonce: number; // nonce for the predictor
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
  counterpartyCollateral?: string; // wei string - counterparty's collateral for escrow auctions
  picks: Array<{
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
  /** Skip intent signature signing (use for estimate-only / forecast components) */
  skipIntentSigning?: boolean;
}

export function useAuctionStart(options?: UseAuctionStartOptions) {
  const shouldLog = !options?.disableLogging;
  const shouldSignIntent = !options?.skipIntentSigning;
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
    signTypedDataRaw: sessionSignTypedDataRaw,
    effectiveAddress,
    isUsingSmartAccount,
    isUsingSession,
  } = useSession();
  const { signTypedDataAsync } = useSignTypedData();

  // Stable refs for session state — read at call time, don't trigger requestQuotes recreation
  const effectiveAddressRef = useRef(effectiveAddress);
  const etherealSessionApprovalRef = useRef(etherealSessionApproval);
  const sessionSignMessageRef = useRef(sessionSignMessage);
  const sessionSignTypedDataRawRef = useRef(sessionSignTypedDataRaw);
  const isUsingSmartAccountRef = useRef(isUsingSmartAccount);
  const isUsingSessionRef = useRef(isUsingSession);

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
    sessionSignTypedDataRawRef.current = sessionSignTypedDataRaw;
  }, [sessionSignTypedDataRaw]);
  useEffect(() => {
    isUsingSmartAccountRef.current = isUsingSmartAccount;
  }, [isUsingSmartAccount]);
  useEffect(() => {
    isUsingSessionRef.current = isUsingSession;
  }, [isUsingSession]);

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
          payload?: Record<string, unknown>;
        };

        // ---------------------------------------------------------------
        // Handle ack response for our pending auction.start.
        // With optimistic IDs the auction is already active; the ack
        // confirms it and may provide a relayer-assigned ID that
        // supersedes the optimistic one.
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
            latestAuctionIdRef.current = null;
            setAuctionId(null);
            inflightRef.current = '';
            pendingBidsRef.current.clear();
            return;
          }

          // If the relayer assigned a different auctionId, adopt it.
          // Otherwise the optimistic ID (already set) stays.
          const relayerId = (data?.payload?.auctionId as string) || null;
          if (relayerId && relayerId !== latestAuctionIdRef.current) {
            latestAuctionIdRef.current = relayerId;
            setAuctionId(relayerId);
            log(
              `[escrow] Relayer assigned auctionId=${relayerId.slice(0, 8)} (was ${msgId.slice(0, 8)})`
            );
          }

          // Replay any bids that arrived while waiting for the ack.
          // Quoters can respond before the relayer acks, so bids keyed to
          // the relayer-assigned ID (or the optimistic ID) may be buffered.
          const activeId = latestAuctionIdRef.current;
          if (activeId && pendingBidsRef.current.size > 0) {
            const buffered = pendingBidsRef.current.get(activeId);
            if (buffered && buffered.length > 0) {
              log(
                `[escrow] Replaying ${buffered.length} buffered bid(s) for ${activeId.slice(0, 8)}`
              );
              setBids(buffered);
            }
            pendingBidsRef.current.clear();
          }

          // Subscribe to auction updates
          if (activeId) {
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId: activeId },
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
            ? (data.payload.bids as Array<Record<string, unknown>>)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  const requestQuotes = useCallback(
    async (
      params: AuctionParams | null,
      // eslint-disable-next-line @typescript-eslint/no-shadow
      options?: { forceRefresh?: boolean }
    ) => {
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
        picks: params.picks,
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

      if (!params.picks || params.picks.length === 0) {
        console.error(
          '[Auction] Escrow picks missing — all auctions require escrow format'
        );
        inflightRef.current = '';
        return;
      }

      const chainId = params.chainId;

      // Build the signed auction payload via SDK
      // prepareAuctionRFQ handles: pick canonicalization, deadline computation,
      // EIP-712 typed data building, signing, payload assembly, self-validation.
      const canSign =
        walletAddress ||
        (isUsingSessionRef.current && sessionSignTypedDataRawRef.current);
      const skipSigning = !shouldSignIntent || !canSign;

      if (!shouldSignIntent) {
        log('[auction] Intent signing disabled (skipIntentSigning=true)');
      } else if (!canSign) {
        log(
          `[auction] Intent signing skipped: canSign=false (wallet=${!!walletAddress}, isUsingSession=${isUsingSessionRef.current}, hasSessionSigner=${!!sessionSignTypedDataRawRef.current})`
        );
      }

      let escrowPayload: Record<string, unknown>;
      let predictorDeadline: number;

      try {
        const prepared = await prepareAuctionRFQ({
          picks: params.picks.map(
            (p): Pick => ({
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome,
            })
          ),
          predictorCollateral: BigInt(params.wager),
          predictor: effectivePredictor,
          chainId,
          nonce: params.predictorNonce,
          signIntent: async (typedData: SignableTypedData): Promise<Hex> => {
            if (
              isUsingSessionRef.current &&
              sessionSignTypedDataRawRef.current
            ) {
              log('[auction] Signing intent with session key');
              return sessionSignTypedDataRawRef.current({
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
              });
            }
            log('[auction] Signing intent with wallet');
            return signTypedDataAsync({
              domain: typedData.domain,
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message,
            });
          },
          options: {
            deadlineSeconds: 30,
            skipIntentSigning: skipSigning,
            predictorSponsor: params.predictorSponsor,
            predictorSponsorData: params.predictorSponsorData,
            sessionKeyData: etherealSessionApprovalRef.current
              ? JSON.stringify({
                  approval: etherealSessionApprovalRef.current.approval,
                  typedData: etherealSessionApprovalRef.current.typedData,
                })
              : undefined,
            // Skip self-validation — the relayer validates on receipt
            skipSelfValidation: true,
          },
        });

        escrowPayload = prepared.payload as unknown as Record<string, unknown>;
        predictorDeadline = prepared.deadline;

        if (prepared.payload.intentSignature) {
          log(
            `[auction] Intent signed: ${prepared.payload.intentSignature.slice(0, 20)}...`
          );
        }
      } catch (e) {
        log(
          `[auction] Auction preparation failed: ${e instanceof Error ? e.message : String(e)}`
        );
        inflightRef.current = '';
        return;
      }

      // Store predictorDeadline on the auction ref so buildMintRequestDataFromBid can access it
      lastAuctionRef.current = {
        ...lastAuctionRef.current,
        predictorDeadline,
      };

      // Optimistic auction ID: the client generates the auctionId upfront
      // and sets it immediately. Bids can match right away from either the
      // relayer (WS) or peer mesh path. If the relayer responds with an ack,
      // it confirms the auction; the ID is already active either way.
      const messageId = crypto.randomUUID();
      sentMessageIdRef.current = messageId;
      latestAuctionIdRef.current = messageId;
      loggedStaleAuctionsRef.current.clear();
      setAuctionId(messageId);

      log(
        `[auction] Sending auction.start: auctionId=${messageId.slice(0, 8)}, keys=${Object.keys(escrowPayload).join(',')}, hasIntentSig=${!!escrowPayload.intentSignature}, hasSessionKeyData=${!!escrowPayload.predictorSessionKeyData}`
      );

      client.send({
        id: messageId,
        type: 'auction.start',
        payload: { ...escrowPayload, id: messageId },
      });

      // Ack timeout — clear the pending correlation ID so stale acks
      // from the relayer are ignored. The auction ID stays active.
      if (ackTimeoutRef.current) window.clearTimeout(ackTimeoutRef.current);
      ackTimeoutRef.current = window.setTimeout(() => {
        if (sentMessageIdRef.current !== messageId) return;
        sentMessageIdRef.current = null;
        log(
          `[auction] relayer ack timeout (auction ${messageId.slice(0, 8)} active via optimistic ID)`
        );
      }, 10_000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wsUrl, walletAddress, signTypedDataAsync]
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

      const picks = auction.picks;
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
        predictorSponsor: auction.predictorSponsor,
        predictorSponsorData: auction.predictorSponsorData,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
