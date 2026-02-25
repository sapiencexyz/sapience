import WebSocket from 'ws';
import type { RawData } from 'ws';
import type {
  AuctionRFQPayload,
  AuctionDetails,
  BidPayload,
  BurnRequestPayload,
  ClientToServerMessage,
  ServerToClientMessage,
  PickJson,
} from '../types/escrow';

// ============================================================================
// Escrow Auction WebSocket Client
// ============================================================================

export interface AuctionWsHandlers {
  onOpen?: () => void;
  onClose?: (code: number, reason: Buffer) => void;
  onError?: (err: unknown) => void;
  onParseError?: (err: unknown, rawData: RawData) => void;

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
  onBurnAck?: (payload: {
    burnId?: string;
    transactionHash?: string;
    error?: string;
  }) => void;
  onPong?: () => void;
  onServerError?: (payload: { message: string; code?: string }) => void;

  // Fallback for unhandled messages
  onMessage?: (msg: ServerToClientMessage) => void;
}

export interface AuctionWsOptions {
  maxRetries?: number;
  pingInterval?: number; // ms, default 30000
}

/**
 * Create an escrow auction WebSocket client with typed message handling
 */
export function createEscrowAuctionWs(
  url: string,
  handlers: AuctionWsHandlers = {},
  options: AuctionWsOptions = {}
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
      case 'burn.ack':
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
        const msg = JSON.parse(String(data)) as ServerToClientMessage;
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

  function send(msg: ClientToServerMessage): boolean {
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
     * Request a bilateral burn (pre-resolution exit)
     */
    requestBurn(payload: BurnRequestPayload): boolean {
      return send({ type: 'burn.request', payload });
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

/**
 * Build an escrow burn request payload
 */
export function buildBurnRequest(params: {
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
}): BurnRequestPayload {
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
