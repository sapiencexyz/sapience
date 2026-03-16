import { WebSocket } from 'ws';
import type { ClientConnection, ConnectionHooks } from './types';

/**
 * Wraps a raw ws.WebSocket into a transport-agnostic ClientConnection.
 * The optional `hooks.onSend` callback fires after each successful send
 * with the message type — this is the metrics integration point.
 */
export function createWsClientConnection(
  ws: WebSocket,
  hooks?: ConnectionHooks
): ClientConnection {
  const id = crypto.randomUUID();
  return {
    id,
    send(msg: unknown) {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn(
          `[Relayer] Attempted to send on non-OPEN socket (state=${ws.readyState})`
        );
        return;
      }
      const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
      try {
        ws.send(data);
      } catch (err) {
        console.warn('[Relayer] ws.send() failed:', err);
        return;
      }
      // Fire onSend hook — extract message type for metrics
      if (hooks?.onSend) {
        try {
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          const msgType =
            parsed && typeof parsed === 'object' && 'type' in parsed
              ? String((parsed as { type: unknown }).type)
              : 'unknown';
          hooks.onSend(msgType);
        } catch {
          hooks.onSend('unknown');
        }
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
