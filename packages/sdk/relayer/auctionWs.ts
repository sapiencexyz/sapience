import WebSocket from 'ws';
import type { RawData } from 'ws';

export function createAuctionWs(
  url: string,
  handlers: {
    onOpen?: () => void;
    onMessage?: (msg: any) => void;
    onError?: (err: unknown) => void;
    onClose?: (code: number, reason: Buffer) => void;
    // Optional parse-error hook with raw data for easier debugging
    onParseError?: (err: unknown, rawData: RawData) => void;
  } = {},
  options: { maxRetries?: number } = {},
) {
  let ws: WebSocket | null = null;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function scheduleReconnect() {
    if (stopped) return;
    if (options.maxRetries !== undefined && retries >= options.maxRetries) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(6, retries++));
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);

    ws.on('open', () => {
      retries = 0;
      handlers.onOpen?.();
    });

    ws.on('message', (data: RawData) => {
      try {
        const msg = JSON.parse(String(data));
        handlers.onMessage?.(msg);
      } catch (e) {
        handlers.onParseError?.(e, data);
        handlers.onError?.(e);
      }
    });

    ws.on('error', (err: unknown) => {
      handlers.onError?.(err);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      handlers.onClose?.(code, reason);
      scheduleReconnect();
    });
  }

  connect();

  return {
    get socket() {
      return ws;
    },
    send(data: string | Buffer) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(data);
      return true;
    },
    close(code?: number, reason?: string) {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        try {
          ws.close(code, reason);
        } catch {
          // noop
        }
        ws = null;
      }
    },
  };
}


