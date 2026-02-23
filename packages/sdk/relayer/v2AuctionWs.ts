import WebSocket from 'ws';
import type { RawData } from 'ws';
import type {
  V2AuctionRequestPayload,
  V2BidPayload,
  V2BurnRequestPayload,
  V2ClientToServerMessage,
  V2ServerToClientMessage,
  PickJson,
} from '../types/v2';

// ============================================================================
// V2 Auction WebSocket Client
// ============================================================================

export interface V2AuctionWsHandlers {
  onOpen?: () => void;
  onClose?: (code: number, reason: Buffer) => void;
  onError?: (err: unknown) => void;
  onParseError?: (err: unknown, rawData: RawData) => void;

  // V2-specific message handlers
  onAuctionAck?: (payload: {
    auctionId?: string;
    error?: string;
    subscribed?: boolean;
    unsubscribed?: boolean;
  }) => void;
  onBidAck?: (payload: { bidId?: string; error?: string }) => void;
  onAuctionStarted?: (payload: {
    auctionId: string;
    picks: PickJson[];
    predictorCollateral: string;
    counterpartyCollateral: string;
    predictor: string;
    predictorDeadline: number;
    chainId: number;
    createdAt: string;
  }) => void;
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
  onBurnAck?: (payload: {
    burnId?: string;
    transactionHash?: string;
    error?: string;
  }) => void;
  onPong?: () => void;
  onServerError?: (payload: { message: string; code?: string }) => void;

  // Fallback for unhandled messages
  onMessage?: (msg: V2ServerToClientMessage) => void;
}

export interface V2AuctionWsOptions {
  maxRetries?: number;
  pingInterval?: number; // ms, default 30000
}

/**
 * Create a V2 auction WebSocket client with typed message handling
 */
export function createV2AuctionWs(
  url: string,
  handlers: V2AuctionWsHandlers = {},
  options: V2AuctionWsOptions = {}
) {
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
    if (options.maxRetries !== undefined && retries >= options.maxRetries) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(6, retries++));
    reconnectTimer = setTimeout(connect, delay);
  }

  function handleMessage(msg: V2ServerToClientMessage) {
    switch (msg.type) {
      case 'v2.auction.ack':
        handlers.onAuctionAck?.(msg.payload);
        break;
      case 'v2.bid.ack':
        handlers.onBidAck?.(msg.payload);
        break;
      case 'v2.auction.started':
        handlers.onAuctionStarted?.(msg.payload);
        break;
      case 'v2.auction.bids':
        handlers.onAuctionBids?.(msg.payload);
        break;
      case 'v2.auction.filled':
        handlers.onAuctionFilled?.(msg.payload);
        break;
      case 'v2.auction.expired':
        handlers.onAuctionExpired?.(msg.payload);
        break;
      case 'v2.burn.ack':
        handlers.onBurnAck?.(msg.payload);
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
    ws = new WebSocket(url);

    ws.on('open', () => {
      retries = 0;
      handlers.onOpen?.();

      // Start ping interval
      if (pingInterval > 0) {
        pingTimer = setInterval(() => {
          sendPing();
        }, pingInterval);
      }
    });

    ws.on('message', (data: RawData) => {
      try {
        const msg = JSON.parse(String(data)) as V2ServerToClientMessage;
        handleMessage(msg);
      } catch (e) {
        handlers.onParseError?.(e, data);
        handlers.onError?.(e);
      }
    });

    ws.on('error', (err: unknown) => {
      handlers.onError?.(err);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      clearTimers();
      handlers.onClose?.(code, reason);
      scheduleReconnect();
    });
  }

  function send(msg: V2ClientToServerMessage): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
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
      return ws !== null && ws.readyState === WebSocket.OPEN;
    },

    /**
     * Start a new V2 auction
     */
    startAuction(payload: V2AuctionRequestPayload): boolean {
      return send({ type: 'v2.auction.start', payload });
    },

    /**
     * Subscribe to auction updates
     */
    subscribeAuction(auctionId: string): boolean {
      return send({ type: 'v2.auction.subscribe', payload: { auctionId } });
    },

    /**
     * Unsubscribe from auction updates
     */
    unsubscribeAuction(auctionId: string): boolean {
      return send({ type: 'v2.auction.unsubscribe', payload: { auctionId } });
    },

    /**
     * Submit a bid as counterparty
     */
    submitBid(payload: V2BidPayload): boolean {
      return send({ type: 'v2.bid.submit', payload });
    },

    /**
     * Request a bilateral burn (pre-resolution exit)
     */
    requestBurn(payload: V2BurnRequestPayload): boolean {
      return send({ type: 'v2.burn.request', payload });
    },

    /**
     * Send ping to keep connection alive
     */
    ping: sendPing,

    /**
     * Send raw message
     */
    sendRaw(msg: V2ClientToServerMessage): boolean {
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
 * Build a V2 auction request payload
 */
export function buildV2AuctionRequest(params: {
  picks: PickJson[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: string;
  predictorNonce: number;
  predictorDeadline: number;
  predictorSignature: string;
  chainId: number;
  refCode?: string;
  predictorSessionKeyData?: string;
}): V2AuctionRequestPayload {
  return {
    picks: params.picks,
    predictorCollateral: params.predictorCollateral.toString(),
    counterpartyCollateral: params.counterpartyCollateral.toString(),
    predictor: params.predictor,
    predictorNonce: params.predictorNonce,
    predictorDeadline: params.predictorDeadline,
    predictorSignature: params.predictorSignature,
    chainId: params.chainId,
    refCode: params.refCode,
    predictorSessionKeyData: params.predictorSessionKeyData,
  };
}

/**
 * Build a V2 bid payload
 */
export function buildV2BidPayload(params: {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
}): V2BidPayload {
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

/**
 * Build a V2 burn request payload
 */
export function buildV2BurnRequest(params: {
  pickConfigId: string;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorHolder: string;
  counterpartyHolder: string;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  predictorNonce: number;
  counterpartyNonce: number;
  predictorDeadline: number;
  counterpartyDeadline: number;
  predictorSignature: string;
  counterpartySignature: string;
  chainId: number;
  refCode?: string;
  predictorSessionKeyData?: string;
  counterpartySessionKeyData?: string;
}): V2BurnRequestPayload {
  return {
    pickConfigId: params.pickConfigId,
    predictorTokenAmount: params.predictorTokenAmount.toString(),
    counterpartyTokenAmount: params.counterpartyTokenAmount.toString(),
    predictorHolder: params.predictorHolder,
    counterpartyHolder: params.counterpartyHolder,
    predictorPayout: params.predictorPayout.toString(),
    counterpartyPayout: params.counterpartyPayout.toString(),
    predictorNonce: params.predictorNonce,
    counterpartyNonce: params.counterpartyNonce,
    predictorDeadline: params.predictorDeadline,
    counterpartyDeadline: params.counterpartyDeadline,
    predictorSignature: params.predictorSignature,
    counterpartySignature: params.counterpartySignature,
    chainId: params.chainId,
    refCode: params.refCode,
    predictorSessionKeyData: params.predictorSessionKeyData,
    counterpartySessionKeyData: params.counterpartySessionKeyData,
  };
}
