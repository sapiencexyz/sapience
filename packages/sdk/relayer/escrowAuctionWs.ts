import type {
  AuctionRFQPayload,
  AuctionDetails,
  BidPayload,
  ClientToServerMessage,
  ServerToClientMessage,
  PickJson,
} from '../types/escrow';

// ============================================================================
// Escrow Auction WebSocket Client
// ============================================================================

export interface AuctionWsHandlers {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: unknown) => void;
  onParseError?: (err: unknown, rawData: unknown) => void;

  // Escrow-specific message handlers
  onAuctionAck?: (payload: {
    auctionId?: string;
    error?: string;
    subscribed?: boolean;
    unsubscribed?: boolean;
  }) => void;
  onBidAck?: (payload: { bidId?: string; error?: string }) => void;
  onAuctionStarted?: (payload: AuctionDetails) => void;
  onAuctionBids?: (payload: {
    auctionId: string;
    bids: Array<{
      auctionId: string;
      counterparty: string;
      counterpartyDeadline: number;
      receivedAt: string;
    }>;
  }) => void;
  onAuctionFilled?: (payload: {
    auctionId: string;
    predictionId: string;
    pickConfigId: string;
    transactionHash: string;
  }) => void;
  onAuctionExpired?: (payload: { auctionId: string; reason: string }) => void;
  onPong?: () => void;
  onServerError?: (payload: { message: string; code?: string }) => void;

  // Fallback for unhandled messages
  onMessage?: (msg: ServerToClientMessage) => void;
}

export interface AuctionWsOptions {
  maxRetries?: number;
  pingInterval?: number; // ms, default 30000
}

/** WebSocket readyState value for OPEN (same in both browser and Node.js ws). */
const WS_OPEN = 1;

/**
 * Resolve the WebSocket constructor for the current environment.
 * Prefers the browser-native WebSocket; falls back to the Node.js `ws` package
 * via dynamic import (avoids top-level import that would break browser bundling).
 */
async function resolveWebSocket(): Promise<{
  new (url: string): WebSocket;
}> {
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).WebSocket === 'function'
  ) {
    return globalThis.WebSocket;
  }

  try {
    // Dynamic import — ws is an optional peer dependency
    const wsModule = await import('ws');
    return (wsModule.default || wsModule) as unknown as {
      new (url: string): WebSocket;
    };
  } catch {
    throw new Error(
      'WebSocket not available. For Node.js, install the "ws" package. ' +
        'For browser environments, ensure globalThis.WebSocket is available.'
    );
  }
}

/**
 * Create an escrow auction WebSocket client with typed message handling.
 *
 * Returns a Promise that resolves once the WebSocket constructor has been
 * resolved (browser-native or Node.js `ws` via dynamic import) and the
 * initial connection has been initiated.
 */
export async function createEscrowAuctionWs(
  url: string,
  handlers: AuctionWsHandlers = {},
  options: AuctionWsOptions = {}
) {
  const WS = await resolveWebSocket();

  let ws: WebSocket | null = null;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const pingInterval = options.pingInterval ?? 30000;

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    if (options.maxRetries !== undefined && retries >= options.maxRetries)
      return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(6, retries++));
    reconnectTimer = setTimeout(connect, delay);
  }

  function handleMessage(msg: ServerToClientMessage) {
    switch (msg.type) {
      case 'auction.ack':
        handlers.onAuctionAck?.(msg.payload);
        break;
      case 'bid.ack':
        handlers.onBidAck?.(msg.payload);
        break;
      case 'auction.started':
        handlers.onAuctionStarted?.(msg.payload);
        break;
      case 'auction.bids':
        handlers.onAuctionBids?.(msg.payload);
        break;
      case 'auction.filled':
        handlers.onAuctionFilled?.(msg.payload);
        break;
      case 'auction.expired':
        handlers.onAuctionExpired?.(msg.payload);
        break;
      case 'pong':
        handlers.onPong?.();
        break;
      case 'error':
        handlers.onServerError?.(msg.payload);
        break;
      default:
        // Unknown message type
        break;
    }
    // Always call generic handler if provided
    handlers.onMessage?.(msg);
  }

  function connect() {
    if (stopped) return;
    ws = new WS(url);

    ws.onopen = () => {
      retries = 0;
      handlers.onOpen?.();

      // Start ping interval
      if (pingInterval > 0) {
        pingTimer = setInterval(() => {
          sendPing();
        }, pingInterval);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const raw =
          typeof event.data === 'string' ? event.data : String(event.data);
        const msg = JSON.parse(raw) as ServerToClientMessage;
        handleMessage(msg);
      } catch (e) {
        handlers.onParseError?.(e, event.data);
        handlers.onError?.(e);
      }
    };

    ws.onerror = () => {
      handlers.onError?.(new Error('WebSocket connection error'));
    };

    ws.onclose = (event: CloseEvent) => {
      clearTimers();
      handlers.onClose?.(event.code, event.reason);
      scheduleReconnect();
    };
  }

  function send(msg: ClientToServerMessage): boolean {
    if (!ws || ws.readyState !== WS_OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  function sendPing(): boolean {
    return send({ type: 'ping' });
  }

  // Connect immediately
  connect();

  return {
    /** Raw WebSocket instance */
    get socket() {
      return ws;
    },

    /** Check if connected and ready */
    get isConnected() {
      return ws !== null && ws.readyState === WS_OPEN;
    },

    /**
     * Start a new escrow auction
     */
    startAuction(payload: AuctionRFQPayload): boolean {
      return send({ type: 'auction.start', payload });
    },

    /**
     * Subscribe to auction updates
     */
    subscribeAuction(auctionId: string): boolean {
      return send({ type: 'auction.subscribe', payload: { auctionId } });
    },

    /**
     * Unsubscribe from auction updates
     */
    unsubscribeAuction(auctionId: string): boolean {
      return send({ type: 'auction.unsubscribe', payload: { auctionId } });
    },

    /**
     * Submit a bid as counterparty
     */
    submitBid(payload: BidPayload): boolean {
      return send({ type: 'bid.submit', payload });
    },

    /**
     * Send ping to keep connection alive
     */
    ping: sendPing,

    /**
     * Send raw message
     */
    sendRaw(msg: ClientToServerMessage): boolean {
      return send(msg);
    },

    /**
     * Close the connection
     */
    close(code?: number, reason?: string) {
      stopped = true;
      clearTimers();
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

// ============================================================================
// Message Builder Helpers
// ============================================================================

/**
 * Build an escrow auction request payload
 */
export function buildAuctionRequest(params: {
  picks: PickJson[];
  predictorCollateral: bigint;
  predictor: string;
  predictorNonce: number;
  predictorDeadline: number;
  intentSignature: string;
  chainId: number;
  refCode?: string;
  predictorSessionKeyData?: string;
}): AuctionRFQPayload {
  return {
    picks: params.picks,
    predictorCollateral: params.predictorCollateral.toString(),
    predictor: params.predictor,
    predictorNonce: params.predictorNonce,
    predictorDeadline: params.predictorDeadline,
    intentSignature: params.intentSignature,
    chainId: params.chainId,
    refCode: params.refCode,
    predictorSessionKeyData: params.predictorSessionKeyData,
  };
}

/**
 * Build an escrow bid payload
 */
export function buildBidPayload(params: {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
}): BidPayload {
  return {
    auctionId: params.auctionId,
    counterparty: params.counterparty,
    counterpartyCollateral: params.counterpartyCollateral,
    counterpartyNonce: params.counterpartyNonce,
    counterpartyDeadline: params.counterpartyDeadline,
    counterpartySignature: params.counterpartySignature,
    counterpartySessionKeyData: params.counterpartySessionKeyData,
  };
}
