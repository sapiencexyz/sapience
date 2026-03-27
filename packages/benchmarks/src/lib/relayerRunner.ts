import { createPublicClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { prepareAuctionRFQ } from '@sapience/sdk/auction/initiate';
import type { SignableTypedData } from '@sapience/sdk/auction/initiate';
import type { PickJson, AuctionRFQPayload, BidPayload } from '@sapience/sdk/types/escrow';
import { validateBidOnChain } from '@sapience/sdk/auction/validation';
import type { EnvConfig } from './constants';
import type { EnrichedPick } from './picks';

function generateRandomNonce(): bigint {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return BigInt(arr[0]) + 1n;
}

function randomCollateral(): bigint {
  const minUsd = 0.01;
  const maxUsd = 10;
  const amount = minUsd + Math.random() * (maxUsd - minUsd);
  return BigInt(Math.floor(amount * 1e6)) * 10n ** 12n;
}

/** Trusted estimator address — bids from this address skip on-chain validation */
const ESTIMATOR_ADDRESS = '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572'.toLowerCase();

export interface AuctionTiming {
  auctionId?: string;
  sentAt: number;
  ackAt?: number;
  startedAt?: number;
  firstBidAt?: number;
  firstValidBidAt?: number;
  firstEstimatorBidAt?: number;
  validating?: boolean;
  error?: string;
  validationError?: string;
  /** Predictor collateral in wei string */
  predictorCollateral?: string;
  /** First bid's counterparty collateral in wei string */
  counterpartyCollateral?: string;
  /** The RFQ payload we sent (needed for bid validation) */
  rfqPayload?: AuctionRFQPayload;
  /** Enriched picks with condition metadata */
  picks?: EnrichedPick[];
}

export interface RelayerSession {
  ws: WebSocket;
  signer: ReturnType<typeof privateKeyToAccount>;
  config: EnvConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any;
  balanceWei?: bigint;
  timings: Map<string, AuctionTiming>;
  onUpdate: () => void;
}

export function createSigner(privateKey: Hex) {
  return privateKeyToAccount(privateKey);
}

function normalizeWsUrl(url: string): string {
  return url.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
}

export function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(normalizeWsUrl(url));
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('WebSocket connection failed'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSessionPublicClient(config: EnvConfig): any {
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

async function validateBid(
  bid: BidPayload,
  timing: AuctionTiming,
  session: RelayerSession
) {
  if (!timing.rfqPayload) return;

  try {
    const result = await validateBidOnChain(
      {
        counterparty: bid.counterparty,
        counterpartyCollateral: bid.counterpartyCollateral,
        counterpartyNonce: bid.counterpartyNonce,
        counterpartyDeadline: bid.counterpartyDeadline,
        counterpartySignature: bid.counterpartySignature,
        counterpartySessionKeyData: bid.counterpartySessionKeyData,
      },
      {
        predictor: timing.rfqPayload.predictor,
        predictorCollateral: timing.rfqPayload.predictorCollateral,
        predictorNonce: timing.rfqPayload.predictorNonce,
        picks: timing.rfqPayload.picks,
        predictorSponsor: timing.rfqPayload.predictorSponsor,
        predictorSponsorData: timing.rfqPayload.predictorSponsorData,
      },
      {
        chainId: session.config.chainId,
        predictionMarketAddress: session.config.escrowAddress as Address,
        collateralTokenAddress: session.config.collateralAddress as Address,
        publicClient: session.publicClient,
        failOpen: false,
      }
    );

    if (result.status === 'valid' || result.status === 'unverified') {
      if (!timing.firstValidBidAt) {
        timing.firstValidBidAt = performance.now();
      }
    } else if ('reason' in result) {
      timing.validationError = result.reason;
    }
  } catch (err) {
    timing.validationError = err instanceof Error ? err.message.slice(0, 80) : 'unknown';
  } finally {
    timing.validating = false;
    session.onUpdate();
  }
}

export function setupMessageHandler(session: RelayerSession) {
  session.ws.onmessage = (event) => {
    try {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      const data = JSON.parse(raw);
      const now = performance.now();

      const msgType = data.type as string;
      const payload = data.payload;

      const messageId = data.id ?? payload?.id;
      const auctionId = payload?.auctionId;

      if (msgType === 'auction.ack' && messageId) {
        const timing = session.timings.get(messageId);
        if (timing) {
          timing.ackAt = now;
          if (auctionId) {
            timing.auctionId = auctionId;
            session.timings.set(auctionId, timing);
          }
          if (payload?.error) {
            timing.error = payload.error;
          }
          session.onUpdate();
        }
      } else if (msgType === 'auction.started' && auctionId) {
        const timing = session.timings.get(auctionId);
        if (timing) {
          timing.startedAt = now;
          session.onUpdate();
        }
      } else if (msgType === 'auction.bids' && auctionId) {
        const timing = session.timings.get(auctionId);
        if (timing) {
          // Run tier 2 validation on each bid
          const bids: BidPayload[] = payload?.bids ?? [];
          if (!timing.firstBidAt) {
            timing.firstBidAt = now;
            if (bids.length > 0) {
              timing.counterpartyCollateral = bids[0].counterpartyCollateral;
            }
            session.onUpdate();
          }

          for (const bid of bids) {
            if (bid.counterparty?.toLowerCase() === ESTIMATOR_ADDRESS) {
              if (!timing.firstEstimatorBidAt) {
                timing.firstEstimatorBidAt = now;
                session.onUpdate();
              }
            } else if (!timing.firstValidBidAt && !timing.validating) {
              timing.validating = true;
              validateBid(bid, timing, session);
            }
          }
        }
      }
    } catch {
      // Ignore unparseable messages
    }
  };
}

export async function sendAuction(
  session: RelayerSession,
  picks: EnrichedPick[]
): Promise<string> {
  const messageId = crypto.randomUUID();
  const nonce = generateRandomNonce();
  const collateral = randomCollateral();

  const { payload } = await prepareAuctionRFQ({
    picks,
    predictorCollateral: collateral,
    predictor: session.signer.address as Address,
    chainId: session.config.chainId,
    nonce,
    signIntent: async (typedData: SignableTypedData) => {
      return session.signer.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      }) as Promise<Hex>;
    },
  });

  const sentAt = performance.now();
  session.timings.set(messageId, {
    sentAt,
    rfqPayload: payload,
    predictorCollateral: payload.predictorCollateral,
    picks,
  });

  session.ws.send(
    JSON.stringify({
      id: messageId,
      type: 'auction.start',
      payload: { ...payload, id: messageId },
    })
  );

  return messageId;
}
