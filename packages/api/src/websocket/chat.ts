import { WebSocketServer, WebSocket, RawData } from 'ws';
import http from 'http';
import type { Socket } from 'net';
import { validateToken } from './chatAuth';

export type StoredMessage = {
  text: string;
  address?: string;
  timestamp: number;
  clientId?: string;
};

const MESSAGE_LIMIT = 200;
const MAX_CONNECTIONS_PER_IP = 50; // simple cap
const SEND_RATE_WINDOW_MS = 10_000; // 10s
const SEND_RATE_MAX_PER_WINDOW = 20; // max 20 messages per 10s per address

// In-memory message history for all chat clients
const messages: StoredMessage[] = [];
const ipToConnectionCount = new Map<string, number>();
const addressToSendRate = new Map<
  string,
  { windowStart: number; count: number }
>();

export function createChatWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });

  wss.on(
    'connection',
    (ws: WebSocket & { userAddress?: string; _ip?: string }) => {
      try {
        ws.send(JSON.stringify({ type: 'history', messages }));
      } catch {
        // no-op
      }

      ws.on('message', (raw: RawData) => {
        let clientId: string | undefined;
        try {
          const data = JSON.parse(String(raw));
          const text = typeof data.text === 'string' ? data.text : '';
          clientId =
            typeof data.clientId === 'string' ? data.clientId : undefined;
          // Require authenticated address for posting
          const address = ws.userAddress || undefined;
          if (!address) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  text: 'auth_required',
                  clientId,
                })
              );
            } catch {
              // no-op
            }
            return;
          }
          // Reject empty/whitespace-only messages
          if (!text || text.trim().length === 0) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  text: 'empty_message',
                  clientId,
                })
              );
            } catch {
              // no-op
            }
            return;
          }
          // Per-address rate limiting
          const now = Date.now();
          const rate = addressToSendRate.get(address);
          if (!rate || now - rate.windowStart > SEND_RATE_WINDOW_MS) {
            addressToSendRate.set(address, { windowStart: now, count: 1 });
          } else {
            rate.count += 1;
            if (rate.count > SEND_RATE_MAX_PER_WINDOW) {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    text: 'rate_limited',
                    clientId,
                  })
                );
              } catch {
                // no-op
              }
              return;
            }
          }
          const stored: StoredMessage = {
            text,
            address,
            timestamp: Date.now(),
            clientId,
          };
          messages.push(stored);
          if (messages.length > MESSAGE_LIMIT)
            messages.splice(0, messages.length - MESSAGE_LIMIT);

          // Broadcast to all clients, including sender, so the author sees confirmed echo
          wss.clients.forEach((client: WebSocket) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: 'message',
                  text,
                  address,
                  clientId,
                  timestamp: stored.timestamp,
                })
              );
            }
          });
        } catch (err) {
          try {
            ws.send(
              JSON.stringify({
                type: 'error',
                text: (err as Error).message,
                clientId,
              })
            );
          } catch {
            // no-op
          }
        }
      });
    }
  );

  // Upgrade handler for /chat path
  server.on(
    'upgrade',
    (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
      const { url } = request;
      const isChatPath = !!url && url.startsWith('/chat');
      if (isChatPath) {
        try {
          const parsedUrl = new URL(url, 'http://localhost');
          const token = parsedUrl.searchParams.get('token');
          const session = validateToken(token);
          // Per-IP connection limiting
          const ip =
            (request.headers['x-forwarded-for'] as string)
              ?.split(',')[0]
              ?.trim() ||
            request.socket.remoteAddress ||
            'unknown';
          const current = ipToConnectionCount.get(ip) || 0;
          if (current >= MAX_CONNECTIONS_PER_IP) {
            socket.destroy();
            return;
          }
          // Allow connection for read-only even if unauthenticated; we'll require auth on send
          wss.handleUpgrade(
            request,
            socket,
            head,
            (ws: WebSocket & { userAddress?: string; _ip?: string }) => {
              ws._ip = ip;
              ipToConnectionCount.set(
                ip,
                (ipToConnectionCount.get(ip) || 0) + 1
              );
              if (session) ws.userAddress = session.address;
              wss.emit('connection', ws, request);
              ws.on('close', () => {
                const prev = ipToConnectionCount.get(ip) || 1;
                if (prev <= 1) ipToConnectionCount.delete(ip);
                else ipToConnectionCount.set(ip, prev - 1);
              });
            }
          );
        } catch {
          socket.destroy();
        }
      } else {
        // Not a chat upgrade path; allow other WebSocket handlers (e.g., /auction)
        // to process this upgrade without destroying the socket here.
        return;
      }
    }
  );

  return wss;
}
