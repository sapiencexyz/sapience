import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { addBid, getBids, upsertAuction, getAuction } from './registry';
import { basicValidateBid } from './sim';
import { verifyTakerBidStrict } from './helpers';
import {
  PREDICTION_MARKET_ADDRESS_ARB1,
  PREDICTION_MARKET_CHAIN_ID_ARB1,
} from '../constants';
import Sentry from '../instrument';
import type {
  BotToServerMessage,
  ClientToServerMessage,
  ServerToClientMessage,
  AuctionRequestPayload,
  BidPayload,
} from './types';

function isClientMessage(msg: unknown): msg is ClientToServerMessage {
  if (!msg || typeof msg !== 'object' || msg === null || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return (
    typeof msgObj.type === 'string' &&
    (msgObj.type === 'auction.start' || msgObj.type === 'auction.subscribe')
  );
}

function isBotMessage(msg: unknown): msg is BotToServerMessage {
  if (!msg || typeof msg !== 'object' || msg === null || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return msgObj.type === 'bid.submit';
}

function safeParse<T = unknown>(data: RawData): T | null {
  try {
    return JSON.parse(String(data)) as T;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, message: ServerToClientMessage) {
  ws.send(JSON.stringify(message));
}

function subscribeToAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  if (!auctionSubscriptions.has(auctionId)) {
    auctionSubscriptions.set(auctionId, new Set());
  }
  auctionSubscriptions.get(auctionId)!.add(ws);
  console.log(`[Auction-WS] Client subscribed to auction ${auctionId}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function unsubscribeFromAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      auctionSubscriptions.delete(auctionId);
    }
    console.log(`[Auction-WS] Client unsubscribed from auction ${auctionId}`);
  }
}

function unsubscribeFromAllAuctions(
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  for (const [auctionId, subscribers] of auctionSubscriptions.entries()) {
    if (subscribers.has(ws)) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        auctionSubscriptions.delete(auctionId);
      }
    }
  }
}

function broadcastToAuctionSubscribers(
  auctionId: string,
  message: ServerToClientMessage,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (!subscribers || subscribers.size === 0) {
    return 0;
  }

  const dataStr = JSON.stringify(message);
  let recipients = 0;
  subscribers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(dataStr);
        recipients++;
      } catch (error) {
        console.warn(`[Auction-WS] Failed to send to subscriber:`, error);
        subscribers.delete(ws);
      }
    } else {
      subscribers.delete(ws);
    }
  });

  return recipients;
}

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 100;

export function createAuctionWebSocketServer() {
  const wss = new WebSocketServer({ noServer: true });

  // Track which clients are subscribed to which auction channels
  const auctionSubscriptions = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    const ip =
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      'unknown';
    const ua = (req.headers['user-agent'] as string) || 'unknown';
    console.log(`[Auction-WS] Connection opened from ${ip} ua="${ua}"`);

    let rateCount = 0;
    let rateResetAt = Date.now() + RATE_LIMIT_WINDOW_MS;

    ws.on('message', (data: RawData) => {
      // basic rate limiting and size guard
      const now = Date.now();
      if (now > rateResetAt) {
        rateCount = 0;
        rateResetAt = now + RATE_LIMIT_WINDOW_MS;
      }
      if (++rateCount > RATE_LIMIT_MAX_MESSAGES) {
        console.warn(
          `[Auction-WS] Rate limit exceeded from ${ip}; closing connection`
        );
        try {
          ws.close(1008, 'rate_limited');
        } catch {
          /* ignore */
        }
        return;
      }
      const dataSize =
        typeof data === 'string'
          ? (data as string).length
          : (data as Buffer).byteLength;
      if (dataSize > 64_000) {
        console.warn(
          `[Auction-WS] Message too large from ${ip}; closing connection`
        );
        try {
          ws.close(1009, 'message_too_large');
        } catch {
          /* ignore */
        }
        return;
      }
      const msg = safeParse<ClientToServerMessage | BotToServerMessage>(data);
      if (!msg || typeof msg !== 'object') {
        console.warn(`[Auction-WS] Invalid JSON from ${ip}`);
        return;
      }

      // Handle Auction client messages
      if (isClientMessage(msg)) {
        if (msg.type === 'auction.start') {
          const payload = msg.payload as AuctionRequestPayload;
          const auctionId = upsertAuction(payload);
          console.log(
            `[Auction-WS] auction.start received auctionId=${auctionId}`
          );

          // Subscribe this client to the auction channel
          subscribeToAuction(auctionId, ws, auctionSubscriptions);

          send(ws, {
            type: 'auction.ack',
            payload: { auctionId },
          });

          // Broadcast the auction.started to bots/listeners (all clients for now)
          const requested = JSON.stringify({
            type: 'auction.started',
            payload: { ...payload, auctionId },
          });
          let broadcastCount = 0;
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(requested);
            broadcastCount += client.readyState === WebSocket.OPEN ? 1 : 0;
          });
          console.log(
            `[Auction-WS] auction.started broadcast auctionId=${auctionId} recipients=${broadcastCount}/${wss.clients.size}`
          );

          // Immediately stream current bids for this auction if any
          const bids = getBids(auctionId);
          if (bids.length > 0) {
            send(ws, {
              type: 'auction.bids',
              payload: { auctionId, bids },
            });
            console.log(
              `[Auction-WS] Sent existing bids auctionId=${auctionId} count=${bids.length}`
            );
          }
          return;
        }
        if (msg.type === 'auction.subscribe') {
          const auctionId = (msg.payload as { auctionId?: string })?.auctionId;
          if (typeof auctionId === 'string' && auctionId.length > 0) {
            subscribeToAuction(auctionId, ws, auctionSubscriptions);
            // Immediately stream current bids if any
            const bids = getBids(auctionId);
            if (bids.length > 0) {
              send(ws, {
                type: 'auction.bids',
                payload: { auctionId, bids },
              });
            }
            console.log(
              `[Auction-WS] subscribe accepted auctionId=${auctionId}`
            );
          } else {
            console.warn('[Auction-WS] subscribe rejected: missing auctionId');
          }
          return;
        }
      }

      // Handle bot bid messages
      if (isBotMessage(msg)) {
        const bid = msg.payload as BidPayload;
        const rec = getAuction(bid.auctionId);
        if (!rec) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'auction_not_found_or_expired' },
          });
          console.warn(
            `[Auction-WS] bid.submit rejected auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
          );
          return;
        }
        const sim = basicValidateBid(rec.auction, bid);
        if (!sim.ok) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: sim.reason || 'invalid_bid' },
          });
          console.warn(
            `[Auction-WS] bid.submit rejected auctionId=${bid.auctionId} reason=${sim.reason || 'invalid_bid'}`
          );
          return;
        }
        // Optional strict EIP-712 verification when address is configured
        (async () => {
          try {
            const strict = await verifyTakerBidStrict({
              auction: rec.auction,
              bid,
              chainId: PREDICTION_MARKET_CHAIN_ID_ARB1,
              verifyingContract: PREDICTION_MARKET_ADDRESS_ARB1,
            });
            if (!strict.ok) {
              console.warn(
                `[Auction-WS] bid.submit strict verification failed auctionId=${bid.auctionId} reason=${strict.reason}`
              );
            }
          } catch {
            // ignore strict verification errors; basic validation already passed
          }
        })().catch(() => undefined);
        const validated = addBid(bid.auctionId, bid);
        if (!validated) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'auction_not_found_or_expired' },
          });
          console.warn(
            `[Auction-WS] bid.submit failed auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
          );
          return;
        }
        send(ws, { type: 'bid.ack', payload: {} });
        console.log(
          `[Auction-WS] bid.submit accepted auctionId=${bid.auctionId}`
        );

        // Broadcast updated top bids only to auction subscribers
        const payload: ServerToClientMessage = {
          type: 'auction.bids',
          payload: { auctionId: bid.auctionId, bids: getBids(bid.auctionId) },
        };
        const recipients = broadcastToAuctionSubscribers(
          bid.auctionId,
          payload,
          auctionSubscriptions
        );
        console.log(
          `[Auction-WS] auction.bids broadcast auctionId=${bid.auctionId} recipients=${recipients}`
        );
        return;
      }

      console.warn(
        `[Auction-WS] Unhandled message type from ${ip}: ${
          (msg as Record<string, unknown>)?.type ?? typeof msg
        }`
      );
    });

    ws.on('error', (err) => {
      console.error(`[Auction-WS] Socket error from ${ip}:`, err);
      try {
        Sentry.captureException(err);
      } catch {
        /* ignore */
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = (() => {
        try {
          return reason ? reason.toString() : '';
        } catch {
          return '';
        }
      })();

      // Clean up auction subscriptions for this client
      unsubscribeFromAllAuctions(ws, auctionSubscriptions);

      console.log(
        `[Auction-WS] Connection closed from ${ip} code=${code} reason="${reasonStr}"`
      );
    });
  });

  return wss;
}
