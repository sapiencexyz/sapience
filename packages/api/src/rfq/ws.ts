import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { addBid, getBids, upsertRfq, getRfq } from './registry';
import { basicValidateBid } from './sim';
import Sentry from '../instrument';
import type {
  BotToServerMessage,
  ClientToServerMessage,
  ServerToClientMessage,
  RfqRequestPayload,
  BidPayload,
} from './types';

function isClientMessage(msg: unknown): msg is ClientToServerMessage {
  return msg && typeof msg.type === 'string' && msg.type.startsWith('rfq.');
}

function isBotMessage(msg: unknown): msg is BotToServerMessage {
  return msg && msg.type === 'bid.submit';
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

export function attachRfqWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws/rfq' });
  console.log('[RFQ-WS] WebSocket server attached at /ws/rfq');

  wss.on('connection', (ws, req) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const ua = (req.headers['user-agent'] as string) || 'unknown';
    console.log(`[RFQ-WS] Connection opened from ${ip} ua="${ua}"`);

    let rateCount = 0;
    let rateResetAt = Date.now() + RATE_LIMIT_WINDOW_MS;

    ws.on('message', (data) => {
      // basic rate limiting and size guard
      const now = Date.now();
      if (now > rateResetAt) {
        rateCount = 0;
        rateResetAt = now + RATE_LIMIT_WINDOW_MS;
      }
      if (++rateCount > RATE_LIMIT_MAX_MESSAGES) {
        console.warn(
          `[RFQ-WS] Rate limit exceeded from ${ip}; closing connection`
        );
        try {
          ws.close(1008, 'rate_limited');
        } catch {
          /* ignore */
        }
        return;
      }
      if (
        typeof data === 'string'
          ? data.length > 64_000
          : (data as Buffer).byteLength > 64_000
      ) {
        console.warn(
          `[RFQ-WS] Message too large from ${ip}; closing connection`
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
        console.warn(`[RFQ-WS] Invalid JSON from ${ip}`);
        return;
      }

      // Handle RFQ client messages
      if (isClientMessage(msg)) {
        if (msg.type === 'rfq.request') {
          const payload = msg.payload as RfqRequestPayload;
          upsertRfq(payload);
          console.log(`[RFQ-WS] rfq.request received rfqId=${payload.rfqId}`);
          send(ws, { type: 'rfq.ack', payload: { rfqId: payload.rfqId } });
          // Broadcast the rfq.requested to bots/listeners
          const requested = JSON.stringify({ type: 'rfq.requested', payload });
          let broadcastCount = 0;
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(requested);
            broadcastCount += client.readyState === WebSocket.OPEN ? 1 : 0;
          });
          console.log(
            `[RFQ-WS] rfq.requested broadcast rfqId=${payload.rfqId} recipients=${broadcastCount}/${wss.clients.size}`
          );
          // Immediately stream current bids for this rfq if any
          const bids = getBids(payload.rfqId);
          if (bids.length > 0) {
            send(ws, {
              type: 'rfq.bids',
              payload: { rfqId: payload.rfqId, bids },
            });
            console.log(
              `[RFQ-WS] Sent existing bids rfqId=${payload.rfqId} count=${bids.length}`
            );
          }
          return;
        }
      }

      // Handle bot bid messages
      if (isBotMessage(msg)) {
        const bid = msg.payload as BidPayload;
        const rec = getRfq(bid.rfqId);
        if (!rec) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'rfq_not_found_or_expired' },
          });
          console.warn(
            `[RFQ-WS] bid.submit rejected rfqId=${bid.rfqId} reason=rfq_not_found_or_expired`
          );
          return;
        }
        const sim = basicValidateBid(rec.rfq, bid);
        if (!sim.ok) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: sim.reason || 'invalid_bid' },
          });
          console.warn(
            `[RFQ-WS] bid.submit rejected rfqId=${bid.rfqId} reason=${sim.reason || 'invalid_bid'}`
          );
          return;
        }
        const validated = addBid(bid.rfqId, bid);
        if (!validated) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'rfq_not_found_or_expired' },
          });
          console.warn(
            `[RFQ-WS] bid.submit failed rfqId=${bid.rfqId} reason=rfq_not_found_or_expired`
          );
          return;
        }
        send(ws, { type: 'bid.ack', payload: { bidId: validated.bidId } });
        console.log(
          `[RFQ-WS] bid.submit accepted rfqId=${bid.rfqId} bidId=${validated.bidId}`
        );

        // Broadcast updated top bids to all clients
        const payload: ServerToClientMessage = {
          type: 'rfq.bids',
          payload: { rfqId: bid.rfqId, bids: getBids(bid.rfqId) },
        };
        const dataStr = JSON.stringify(payload);
        let recipients = 0;
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) client.send(dataStr);
          recipients += client.readyState === WebSocket.OPEN ? 1 : 0;
        });
        console.log(
          `[RFQ-WS] rfq.bids broadcast rfqId=${bid.rfqId} recipients=${recipients}/${wss.clients.size}`
        );
        return;
      }

      console.warn(
        `[RFQ-WS] Unhandled message type from ${ip}: ${
          (msg as Record<string, unknown>)?.type ?? typeof msg
        }`
      );
    });

    ws.on('error', (err) => {
      console.error(`[RFQ-WS] Socket error from ${ip}:`, err);
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
        `[RFQ-WS] Connection closed from ${ip} code=${code} reason="${reasonStr}"`
      );
    });
  });

  return wss;
}
