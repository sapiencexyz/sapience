import { WebSocketServer, WebSocket, RawData } from 'ws';
import http from 'http';
import type { Socket } from 'net';
import { validateToken } from './chatAuth';

export type StoredMessage = {
  text: string;
  address?: string;
  timestamp: number;
};

const MESSAGE_LIMIT = 200;

// In-memory message history for all chat clients
const messages: StoredMessage[] = [];

export function createChatWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws: WebSocket & { userAddress?: string }) => {
    try {
      ws.send(JSON.stringify({ type: 'history', messages }));
    } catch {
      // no-op
    }

    ws.on('message', (raw: RawData) => {
      try {
        const data = JSON.parse(String(raw));
        const text = typeof data.text === 'string' ? data.text : '';
        // Require authenticated address for posting
        const address = ws.userAddress || undefined;
        if (!address) {
          try {
            ws.send(JSON.stringify({ type: 'error', text: 'auth_required' }));
          } catch {
            // no-op
          }
          return;
        }
        const stored: StoredMessage = { text, address, timestamp: Date.now() };
        messages.push(stored);
        if (messages.length > MESSAGE_LIMIT)
          messages.splice(0, messages.length - MESSAGE_LIMIT);

        // Broadcast to other clients only
        wss.clients.forEach((client: WebSocket) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ text, address }));
          }
        });
      } catch (err) {
        try {
          ws.send(JSON.stringify({ text: `Error: ${(err as Error).message}` }));
        } catch {
          // no-op
        }
      }
    });
  });

  // Upgrade handler for /chat path
  server.on(
    'upgrade',
    (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
      const { url } = request;
      if (url && url.startsWith('/chat')) {
        try {
          const parsedUrl = new URL(url, 'http://localhost');
          const token = parsedUrl.searchParams.get('token');
          const session = validateToken(token);
          // Allow connection for read-only even if unauthenticated; we'll require auth on send
          wss.handleUpgrade(
            request,
            socket,
            head,
            (ws: WebSocket & { userAddress?: string }) => {
              if (session) ws.userAddress = session.address;
              wss.emit('connection', ws, request);
            }
          );
        } catch {
          socket.destroy();
        }
      } else {
        socket.destroy();
      }
    }
  );

  return wss;
}
