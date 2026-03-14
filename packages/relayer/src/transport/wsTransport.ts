import { WebSocket } from 'ws';
import type { ClientConnection } from './types';

/**
 * Wraps a raw ws.WebSocket into a transport-agnostic ClientConnection.
 */
export function createWsClientConnection(ws: WebSocket): ClientConnection {
  const id = crypto.randomUUID();
  return {
    id,
    send(msg: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
        ws.send(data);
      }
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
    get isOpen() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
}
