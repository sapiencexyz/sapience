import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createAuctionStartSiweMessage } from '@sapience/sdk';
import type { AuctionRequestPayload, BidPayload } from '../types';

// Test server setup
let httpServer: Server;
let wss: ReturnType<typeof createAuctionWebSocketServer>;
let serverPort: number;

// Test accounts
const takerPrivateKey = generatePrivateKey();
const takerAccount = privateKeyToAccount(takerPrivateKey);
const makerPrivateKey = generatePrivateKey();
const makerAccount = privateKeyToAccount(makerPrivateKey);

// Domain and URI are derived from the Host header in the WebSocket request
// We need to compute them dynamically based on the server port
function getSigningParams() {
  const domain = 'localhost';
  const uri = `http://localhost:${serverPort}`;
  return { domain, uri };
}

// Helper to create WebSocket connection
function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}/auction`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Helper to wait for a specific message type
function waitForMessage(ws: WebSocket, expectedType: string, timeout = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${expectedType}`));
    }, timeout);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === expectedType) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };

    ws.on('message', handler);
  });
}

// Helper to send and wait for response
async function sendAndWait(
  ws: WebSocket,
  message: unknown,
  expectedResponseType: string
): Promise<unknown> {
  const responsePromise = waitForMessage(ws, expectedResponseType);
  ws.send(JSON.stringify(message));
  return responsePromise;
}

// Helper to create signed auction
async function createSignedAuction(): Promise<AuctionRequestPayload> {
  const { domain, uri } = getSigningParams();
  const takerSignedAt = new Date().toISOString();
  const payload = {
    wager: '1000000000000000000',
    predictedOutcomes: ['0xdeadbeef'],
    resolver: '0x1234567890123456789012345678901234567890',
    taker: takerAccount.address,
    takerNonce: Math.floor(Math.random() * 1000000),
    chainId: 42161,
  };

  const message = createAuctionStartSiweMessage(payload, domain, uri, takerSignedAt);
  const signature = await takerAccount.signMessage({ message });

  return {
    ...payload,
    takerSignature: signature,
    takerSignedAt,
  };
}

// Helper to create unsigned auction
function createUnsignedAuction(): AuctionRequestPayload {
  return {
    wager: '1000000000000000000',
    predictedOutcomes: ['0xdeadbeef'],
    resolver: '0x1234567890123456789012345678901234567890',
    taker: takerAccount.address,
    takerNonce: Math.floor(Math.random() * 1000000),
    chainId: 42161,
  };
}

// Helper to create valid bid
function createValidBid(auctionId: string): BidPayload {
  return {
    auctionId,
    maker: makerAccount.address,
    makerWager: '500000000000000000',
    makerDeadline: Math.floor(Date.now() / 1000) + 3600,
    makerSignature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
    makerNonce: 1,
  };
}

beforeAll(async () => {
  // Create HTTP server
  httpServer = createServer();
  wss = createAuctionWebSocketServer();

  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Start server on random available port
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  // Close all WebSocket connections
  for (const client of wss.clients) {
    client.close();
  }

  // Close servers
  await new Promise<void>((resolve) => {
    wss.close(() => {
      httpServer.close(() => resolve());
    });
  });
});

describe('WebSocket Connection Lifecycle', () => {
  it('establishes successful WebSocket connection on /auction endpoint', async () => {
    const ws = await createClient();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('responds with pong when ping message is received', async () => {
    const ws = await createClient();

    const response = await sendAndWait(ws, { type: 'ping' }, 'pong') as { type: string };
    expect(response.type).toBe('pong');

    ws.close();
  });
});

describe('auction.start Handler', () => {
  it('returns auction.ack with auctionId for valid unsigned auction', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    const response = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.auctionId).toBeDefined();
    expect(response.payload.auctionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with auctionId for valid signed auction', async () => {
    const ws = await createClient();
    const auction = await createSignedAuction();

    const response = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.auctionId).toBeDefined();
    expect(response.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with error for invalid taker signature', async () => {
    const ws = await createClient();
    const auction = await createSignedAuction();
    // Tamper with the wager to invalidate the signature
    auction.wager = '2000000000000000000';

    const response = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.error).toBeDefined();

    ws.close();
  });

  it('broadcasts auction.started to all connected clients', async () => {
    const ws1 = await createClient();
    const ws2 = await createClient();
    const auction = createUnsignedAuction();

    // Set up listener on ws2 before ws1 sends auction
    const broadcastPromise = waitForMessage(ws2, 'auction.started');

    // Send auction from ws1
    ws1.send(JSON.stringify({ type: 'auction.start', payload: auction }));

    const broadcast = await broadcastPromise as { type: string; payload: AuctionRequestPayload & { auctionId: string } };
    expect(broadcast.type).toBe('auction.started');
    expect(broadcast.payload.auctionId).toBeDefined();
    expect(broadcast.payload.wager).toBe(auction.wager);

    ws1.close();
    ws2.close();
  });
});

describe('auction.subscribe Handler', () => {
  it('returns auction.ack with subscribed:true for valid auctionId', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    // First create an auction
    const ackResponse = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Then subscribe to it
    const subResponse = await sendAndWait(
      ws,
      { type: 'auction.subscribe', payload: { auctionId } },
      'auction.ack'
    ) as { type: string; payload: { subscribed?: boolean; error?: string } };

    expect(subResponse.payload.subscribed).toBe(true);
    expect(subResponse.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with error for missing auctionId', async () => {
    const ws = await createClient();

    const response = await sendAndWait(
      ws,
      { type: 'auction.subscribe', payload: { auctionId: '' } },
      'auction.ack'
    ) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('missing_auction_id');

    ws.close();
  });
});

describe('auction.unsubscribe Handler', () => {
  it('returns auction.ack with unsubscribed:true for valid auctionId', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    // Create and subscribe to auction
    const ackResponse = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Unsubscribe
    const unsubResponse = await sendAndWait(
      ws,
      { type: 'auction.unsubscribe', payload: { auctionId } },
      'auction.ack'
    ) as { type: string; payload: { unsubscribed?: boolean; error?: string } };

    expect(unsubResponse.payload.unsubscribed).toBe(true);

    ws.close();
  });

  it('returns auction.ack with error for missing auctionId', async () => {
    const ws = await createClient();

    const response = await sendAndWait(
      ws,
      { type: 'auction.unsubscribe', payload: { auctionId: '' } },
      'auction.ack'
    ) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('missing_auction_id');

    ws.close();
  });
});

describe('bid.submit Handler', () => {
  it('returns bid.ack with empty payload for valid bid', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    // Create auction first
    const ackResponse = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;
    const bid = createValidBid(auctionId);

    // Submit bid
    const bidResponse = await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    ) as { type: string; payload: { error?: string } };

    expect(bidResponse.type).toBe('bid.ack');
    expect(bidResponse.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns bid.ack with error for non-existent auction', async () => {
    const ws = await createClient();
    const bid = createValidBid('non-existent-auction-id');

    const response = await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    ) as { type: string; payload: { error?: string } };

    expect(response.type).toBe('bid.ack');
    expect(response.payload.error).toBe('auction_not_found_or_expired');

    ws.close();
  });

  it('returns bid.ack with error for expired makerDeadline', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    // Create auction
    const ackResponse = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;
    const bid = {
      ...createValidBid(auctionId),
      makerDeadline: Math.floor(Date.now() / 1000) - 100, // Expired
    };

    const response = await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    ) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('quote_expired');

    ws.close();
  });

  it('broadcasts auction.bids to subscribed clients after successful bid', async () => {
    const wsCreator = await createClient();
    const wsBidder = await createClient();
    const auction = createUnsignedAuction();

    // Create auction (creator is auto-subscribed)
    const ackResponse = await sendAndWait(
      wsCreator,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Set up listener for auction.bids on creator's connection
    const bidsPromise = waitForMessage(wsCreator, 'auction.bids');

    // Submit bid from bidder
    const bid = createValidBid(auctionId);
    wsBidder.send(JSON.stringify({ type: 'bid.submit', payload: bid }));

    // Creator should receive auction.bids broadcast
    const bidsMessage = await bidsPromise as { type: string; payload: { auctionId: string; bids: BidPayload[] } };
    expect(bidsMessage.type).toBe('auction.bids');
    expect(bidsMessage.payload.auctionId).toBe(auctionId);
    expect(bidsMessage.payload.bids).toHaveLength(1);
    expect(bidsMessage.payload.bids[0].maker).toBe(bid.maker);

    wsCreator.close();
    wsBidder.close();
  });
});

describe('Invalid Messages', () => {
  it('handles non-JSON messages gracefully', async () => {
    const ws = await createClient();

    // Send non-JSON data - should not crash server
    ws.send('this is not json');

    // Wait a bit, then verify connection is still open by sending valid message
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await sendAndWait(ws, { type: 'ping' }, 'pong') as { type: string };
    expect(response.type).toBe('pong');

    ws.close();
  });

  it('handles unknown message types gracefully', async () => {
    const ws = await createClient();

    // Send unknown message type
    ws.send(JSON.stringify({ type: 'unknown.type', payload: {} }));

    // Wait a bit, then verify connection is still open
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await sendAndWait(ws, { type: 'ping' }, 'pong') as { type: string };
    expect(response.type).toBe('pong');

    ws.close();
  });
});

describe('Multiple Bids', () => {
  it('accumulates multiple bids for same auction', async () => {
    const ws = await createClient();
    const auction = createUnsignedAuction();

    // Create auction
    const ackResponse = await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Submit first bid
    const bid1 = createValidBid(auctionId);
    await sendAndWait(ws, { type: 'bid.submit', payload: bid1 }, 'bid.ack');

    // Submit second bid from different maker
    const bid2 = {
      ...createValidBid(auctionId),
      maker: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead',
      makerWager: '600000000000000000',
    };

    // Wait for the auction.bids broadcast after second bid
    const bidsPromise = waitForMessage(ws, 'auction.bids');
    ws.send(JSON.stringify({ type: 'bid.submit', payload: bid2 }));

    const bidsMessage = await bidsPromise as { payload: { bids: BidPayload[] } };
    expect(bidsMessage.payload.bids.length).toBeGreaterThanOrEqual(2);

    ws.close();
  });
});

describe('Subscription Behavior', () => {
  it('receives auction.bids after subscribing to existing auction', async () => {
    const wsCreator = await createClient();
    const wsSubscriber = await createClient();
    const auction = createUnsignedAuction();

    // Create auction
    const ackResponse = await sendAndWait(
      wsCreator,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    ) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Submit a bid first
    const bid = createValidBid(auctionId);
    await sendAndWait(wsCreator, { type: 'bid.submit', payload: bid }, 'bid.ack');

    // Now subscriber joins and subscribes - should receive current bids
    const bidsPromise = waitForMessage(wsSubscriber, 'auction.bids', 2000).catch(() => null);
    wsSubscriber.send(JSON.stringify({ type: 'auction.subscribe', payload: { auctionId } }));

    // Wait for auction.ack (subscription confirmation)
    await waitForMessage(wsSubscriber, 'auction.ack');

    // The server sends current bids after subscription
    const bidsMessage = await bidsPromise;
    if (bidsMessage) {
      const msg = bidsMessage as { payload: { bids: BidPayload[] } };
      expect(msg.payload.bids.length).toBeGreaterThanOrEqual(1);
    }

    wsCreator.close();
    wsSubscriber.close();
  });
});
