import { WebSocketServer, WebSocket, RawData } from 'ws';
import {
  createChallenge,
  refreshToken,
  validateToken,
  verifyAndCreateToken,
} from './chatAuth';

export type StoredMessage = {
  text: string;
  address?: string;
  timestamp: number;
  clientId?: string;
};

const MESSAGE_LIMIT = 200;
const MAX_CONNECTIONS_PER_IP = Number(
  process.env.CHAT_MAX_CONNECTIONS_PER_IP || 50
);
const SEND_RATE_WINDOW_MS = 10_000; // 10s
const SEND_RATE_MAX_PER_WINDOW = 20; // max 20 messages per 10s per IP
const REQUIRE_AUTH = (process.env.CHAT_REQUIRE_AUTH ?? 'true') !== 'false';

// In-memory message history for all chat clients
const messages: StoredMessage[] = [];
const ipToConnectionCount = new Map<string, number>();
const ipToSendRate = new Map<string, { windowStart: number; count: number }>();
const addressToSendRate = new Map<
  string,
  { windowStart: number; count: number }
>();

export function createChatWebSocketServer() {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });

  wss.on(
    'connection',
    (ws: WebSocket & { _ip?: string; _address?: string }, req) => {
      // Extract IP and token on connect
      try {
        const ip =
          req.socket.remoteAddress ||
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          'unknown';
        ws._ip = ip;
        ipToConnectionCount.set(ip, (ipToConnectionCount.get(ip) || 0) + 1);
        if ((ipToConnectionCount.get(ip) || 0) > MAX_CONNECTIONS_PER_IP) {
          try {
            ws.close(1008, 'too_many_connections');
          } catch {
            /* ignore */
          }
          return;
        }
      } catch {
        /* ignore */
      }

      try {
        // Bind token from query if present and valid
        const url = req.url || '/chat';
        // Use a dummy base to parse relative URL
        const u = new URL(url, 'http://localhost');
        const token = u.searchParams.get('token');
        const sess = validateToken(token);
        if (sess) {
          ws._address = sess.address;
          try {
            ws.send(
              JSON.stringify({
                type: 'auth_status',
                authenticated: true,
                address: sess.address,
                expiresAt: sess.expiresAt,
              })
            );
          } catch {
            /* noop */
          }
        } else {
          try {
            ws.send(
              JSON.stringify({ type: 'auth_status', authenticated: false })
            );
          } catch {
            /* noop */
          }
        }
      } catch {
        /* ignore */
      }
      try {
        ws.send(JSON.stringify({ type: 'history', messages }));
      } catch {
        // no-op
      }

      ws.on('message', (raw: RawData) => {
        let clientId: string | undefined;
        try {
          const data = JSON.parse(String(raw));
          const type = typeof data.type === 'string' ? data.type : undefined;
          clientId =
            typeof data.clientId === 'string' ? data.clientId : undefined;

          // Handle auth messages
          if (type === 'auth_init') {
            try {
              const hostHeader = (req.headers['host'] as string) || 'unknown';
              const challenge = createChallenge(hostHeader);
              ws.send(
                JSON.stringify({
                  type: 'auth_challenge',
                  nonce: challenge.nonce,
                  message: challenge.message,
                  expiresAt: challenge.expiresAt,
                })
              );
            } catch {
              try {
                ws.send(
                  JSON.stringify({ type: 'auth_error', reason: 'init_failed' })
                );
              } catch {
                /* noop */
              }
            }
            return;
          }
          if (type === 'auth_response') {
            const address =
              typeof data.address === 'string' ? data.address : '';
            const signature =
              typeof data.signature === 'string' ? data.signature : '';
            const nonce = typeof data.nonce === 'string' ? data.nonce : '';
            (async () => {
              try {
                const result = await verifyAndCreateToken({
                  address,
                  signature,
                  nonce,
                });
                if (!result) {
                  ws.send(
                    JSON.stringify({
                      type: 'auth_error',
                      reason: 'auth_failed',
                    })
                  );
                  return;
                }
                ws._address = address.toLowerCase();
                ws.send(
                  JSON.stringify({
                    type: 'auth_ok',
                    token: result.token,
                    expiresAt: result.expiresAt,
                    address: ws._address,
                  })
                );
                ws.send(
                  JSON.stringify({
                    type: 'auth_status',
                    authenticated: true,
                    address: ws._address,
                    expiresAt: result.expiresAt,
                  })
                );
              } catch {
                try {
                  ws.send(
                    JSON.stringify({
                      type: 'auth_error',
                      reason: 'auth_failed',
                    })
                  );
                } catch {
                  /* noop */
                }
              }
            })();
            return;
          }
          if (type === 'auth_use_token') {
            const token = typeof data.token === 'string' ? data.token : '';
            try {
              const sess = validateToken(token);
              if (!sess) {
                ws.send(
                  JSON.stringify({
                    type: 'auth_error',
                    reason: 'invalid_token',
                  })
                );
                return;
              }
              ws._address = sess.address;
              ws.send(
                JSON.stringify({
                  type: 'auth_status',
                  authenticated: true,
                  address: sess.address,
                  expiresAt: sess.expiresAt,
                })
              );
            } catch {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'auth_error',
                    reason: 'invalid_token',
                  })
                );
              } catch {
                /* noop */
              }
            }
            return;
          }
          if (type === 'auth_refresh') {
            const token = typeof data.token === 'string' ? data.token : '';
            try {
              const rotated = refreshToken(token);
              if (!rotated) {
                ws.send(
                  JSON.stringify({ type: 'auth_error', reason: 'auth_expired' })
                );
                return;
              }
              ws._address = rotated.address;
              ws.send(
                JSON.stringify({
                  type: 'auth_ok',
                  token: rotated.token,
                  expiresAt: rotated.expiresAt,
                  address: rotated.address,
                })
              );
              ws.send(
                JSON.stringify({
                  type: 'auth_status',
                  authenticated: true,
                  address: rotated.address,
                  expiresAt: rotated.expiresAt,
                })
              );
            } catch {
              try {
                ws.send(
                  JSON.stringify({ type: 'auth_error', reason: 'auth_failed' })
                );
              } catch {
                /* noop */
              }
            }
            return;
          }

          // Chat send path - enforce explicit type
          if (type !== 'send') {
            try {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  text: 'invalid_message_type',
                  clientId,
                })
              );
            } catch {
              /* noop */
            }
            return;
          }

          // Chat send path
          const text = typeof data.text === 'string' ? data.text : '';
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
          // If auth required, ensure bound address
          const boundAddress = ws._address;
          if (REQUIRE_AUTH && !boundAddress) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  text: 'auth_required',
                  clientId,
                })
              );
            } catch {
              /* noop */
            }
            return;
          }

          // Rate limiting per IP and per-address (when bound)
          const now = Date.now();
          const ip = ws._ip || 'unknown';
          const ipRate = ipToSendRate.get(ip);
          if (!ipRate || now - ipRate.windowStart > SEND_RATE_WINDOW_MS) {
            ipToSendRate.set(ip, { windowStart: now, count: 1 });
          } else {
            ipRate.count += 1;
            if (ipRate.count > SEND_RATE_MAX_PER_WINDOW) {
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
          if (boundAddress) {
            const addrRate = addressToSendRate.get(boundAddress) || {
              windowStart: now,
              count: 0,
            };
            if (now - addrRate.windowStart > SEND_RATE_WINDOW_MS) {
              addressToSendRate.set(boundAddress, {
                windowStart: now,
                count: 1,
              });
            } else {
              addrRate.count += 1;
              addressToSendRate.set(boundAddress, addrRate);
              if (addrRate.count > SEND_RATE_MAX_PER_WINDOW) {
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
          }
          const stored: StoredMessage = {
            text,
            address: boundAddress,
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
                  address: boundAddress,
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

  // Track connection counts cleanup
  wss.on('connection', (ws: WebSocket & { _ip?: string }) => {
    ws.on('close', () => {
      try {
        const ip = ws._ip || 'unknown';
        const prev = ipToConnectionCount.get(ip) || 1;
        if (prev <= 1) ipToConnectionCount.delete(ip);
        else ipToConnectionCount.set(ip, prev - 1);
      } catch {
        /* ignore */
      }
    });
  });

  return wss;
}
