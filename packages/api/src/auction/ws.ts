import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { addBid, getBids, upsertAuction, getAuction } from './registry';
import { basicValidateBid } from './sim';
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
  return typeof msgObj.type === 'string' && msgObj.type === 'auction.request';
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

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 100;

export function attachAuctionWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws/auction' });
  console.log('[Auction-WS] WebSocket server attached at /ws/auction');

  wss.on('connection', (ws, req) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
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
        if (msg.type === 'auction.request') {
          const payload = msg.payload as AuctionRequestPayload;
          upsertAuction(payload);
          console.log(
            `[Auction-WS] auction.request received auctionId=${payload.auctionId}`
          );
          send(ws, {
            type: 'auction.ack',
            payload: { auctionId: payload.auctionId },
          });
          // Broadcast the auction.requested to bots/listeners
          const requested = JSON.stringify({
            type: 'auction.requested',
            payload,
          });
          let broadcastCount = 0;
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(requested);
            broadcastCount += client.readyState === WebSocket.OPEN ? 1 : 0;
          });
          console.log(
            `[Auction-WS] auction.requested broadcast auctionId=${payload.auctionId} recipients=${broadcastCount}/${wss.clients.size}`
          );
          // Immediately stream current bids for this auction if any
          const bids = getBids(payload.auctionId);
          if (bids.length > 0) {
            send(ws, {
              type: 'auction.bids',
              payload: { auctionId: payload.auctionId, bids },
            });
            console.log(
              `[Auction-WS] Sent existing bids auctionId=${payload.auctionId} count=${bids.length}`
            );
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
        send(ws, { type: 'bid.ack', payload: { bidId: validated.bidId } });
        console.log(
          `[Auction-WS] bid.submit accepted auctionId=${bid.auctionId} bidId=${validated.bidId}`
        );

        // Broadcast updated top bids to all clients
        const payload: ServerToClientMessage = {
          type: 'auction.bids',
          payload: { auctionId: bid.auctionId, bids: getBids(bid.auctionId) },
        };
        const dataStr = JSON.stringify(payload);
        let recipients = 0;
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) client.send(dataStr);
          recipients += client.readyState === WebSocket.OPEN ? 1 : 0;
        });
        console.log(
          `[Auction-WS] auction.bids broadcast auctionId=${bid.auctionId} recipients=${recipients}/${wss.clients.size}`
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
      console.log(
        `[Auction-WS] Connection closed from ${ip} code=${code} reason="${reasonStr}"`
      );
    });
  });

  return wss;
}
