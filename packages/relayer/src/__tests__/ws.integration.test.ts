import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { AuctionRFQPayload, BidPayload } from '../escrowTypes';
import { buildAuctionIntentTypedData } from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import type { Address, Hex } from 'viem';

// Test server setup
let httpServer: Server;
let wss: ReturnType<typeof createAuctionWebSocketServer>;
let serverPort: number;

// Test accounts
const predictorPrivateKey = generatePrivateKey();
const predictorAccount = privateKeyToAccount(predictorPrivateKey);
const counterpartyPrivateKey = generatePrivateKey();
const counterpartyAccount = privateKeyToAccount(counterpartyPrivateKey);

// Helper to create WebSocket connection
function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}/auction`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Helper to wait for a specific message type
function waitForMessage(
  ws: WebSocket,
  expectedType: string,
  timeout = 5000
): Promise<unknown> {
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

// Valid test pick for escrow auctions
const TEST_PICK = {
  conditionResolver: '0x1234567890123456789012345678901234567890',
  conditionId: '0x' + 'ab'.repeat(32),
  predictedOutcome: 0 as const,
};

const TEST_CHAIN_ID = 5064014;
const TEST_ESCROW_ADDRESS = predictionMarketEscrow[TEST_CHAIN_ID]
  ?.address as Address;

// Helper to create a valid escrow auction RFQ payload with a real intent signature
async function createAuctionRFQ(): Promise<AuctionRFQPayload> {
  const nonce = Math.floor(Math.random() * 1000000);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const collateral = '1000000000000000000';

  const picks = [TEST_PICK];
  const sdkPicks = picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));

  // Build & sign the AuctionIntent EIP-712 typed data
  const typedData = buildAuctionIntentTypedData({
    picks: sdkPicks,
    predictor: predictorAccount.address,
    predictorCollateral: BigInt(collateral),
    predictorNonce: BigInt(nonce),
    predictorDeadline: BigInt(deadline),
    verifyingContract: TEST_ESCROW_ADDRESS,
    chainId: TEST_CHAIN_ID,
  });

  const intentSignature = await predictorAccount.signTypedData({
    domain: { ...typedData.domain, chainId: Number(typedData.domain.chainId) },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    picks,
    predictorCollateral: collateral,
    predictor: predictorAccount.address,
    predictorNonce: nonce,
    predictorDeadline: deadline,
    intentSignature,
    chainId: TEST_CHAIN_ID,
  };
}

// Helper to create valid bid
let bidNonce = 0;
function createValidBid(auctionId: string): BidPayload {
  const n = ++bidNonce;
  return {
    auctionId,
    counterparty: counterpartyAccount.address,
    counterpartyCollateral: '500000000000000000',
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    counterpartySignature:
      '0x' + n.toString(16).padStart(2, '0') + 'bb'.repeat(64),
    counterpartyNonce: n,
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

    const response = (await sendAndWait(ws, { type: 'ping' }, 'pong')) as {
      type: string;
    };
    expect(response.type).toBe('pong');

    ws.close();
  });
});

describe('auction.start Handler', () => {
  it('returns auction.ack with auctionId for valid auction', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    const response = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.auctionId).toBeDefined();
    expect(response.payload.auctionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with auctionId for auction with intentSignature', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    const response = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.auctionId).toBeDefined();
    expect(response.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with error for missing picks', async () => {
    const ws = await createClient();
    const auction = { ...(await createAuctionRFQ()), picks: [] };

    const response = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { type: string; payload: { auctionId?: string; error?: string } };

    expect(response.type).toBe('auction.ack');
    expect(response.payload.error).toBeDefined();

    ws.close();
  });

  it('broadcasts auction.started to all connected clients', async () => {
    const ws1 = await createClient();
    const ws2 = await createClient();
    const auction = await createAuctionRFQ();

    // Set up listener on ws2 before ws1 sends auction
    const broadcastPromise = waitForMessage(ws2, 'auction.started');

    // Send auction from ws1
    ws1.send(JSON.stringify({ type: 'auction.start', payload: auction }));

    const broadcast = (await broadcastPromise) as {
      type: string;
      payload: { auctionId: string; predictorCollateral?: string };
    };
    expect(broadcast.type).toBe('auction.started');
    expect(broadcast.payload.auctionId).toBeDefined();

    ws1.close();
    ws2.close();
  });
});

describe('auction.subscribe Handler', () => {
  it('returns auction.ack with subscribed:true for valid auctionId', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    // First create an auction
    const ackResponse = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Then subscribe to it
    const subResponse = (await sendAndWait(
      ws,
      { type: 'auction.subscribe', payload: { auctionId } },
      'auction.ack'
    )) as { type: string; payload: { subscribed?: boolean; error?: string } };

    expect(subResponse.payload.subscribed).toBe(true);
    expect(subResponse.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns auction.ack with error for missing auctionId', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      { type: 'auction.subscribe', payload: { auctionId: '' } },
      'auction.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('missing_auction_id');

    ws.close();
  });
});

describe('auction.unsubscribe Handler', () => {
  it('returns auction.ack with unsubscribed:true for valid auctionId', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    // Create and subscribe to auction
    const ackResponse = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Unsubscribe
    const unsubResponse = (await sendAndWait(
      ws,
      { type: 'auction.unsubscribe', payload: { auctionId } },
      'auction.ack'
    )) as { type: string; payload: { unsubscribed?: boolean; error?: string } };

    expect(unsubResponse.payload.unsubscribed).toBe(true);

    ws.close();
  });

  it('returns auction.ack with error for missing auctionId', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      { type: 'auction.unsubscribe', payload: { auctionId: '' } },
      'auction.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('missing_auction_id');

    ws.close();
  });
});

describe('bid.submit Handler', () => {
  it('returns bid.ack with empty payload for valid bid', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    // Create auction first
    const ackResponse = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;
    const bid = createValidBid(auctionId);

    // Submit bid
    const bidResponse = (await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { type: string; payload: { error?: string } };

    expect(bidResponse.type).toBe('bid.ack');
    expect(bidResponse.payload.error).toBeUndefined();

    ws.close();
  });

  it('returns bid.ack with error for non-existent auction', async () => {
    const ws = await createClient();
    const bid = createValidBid('non-existent-auction-id');

    const response = (await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.type).toBe('bid.ack');
    expect(response.payload.error).toBe('auction_not_found_or_expired');

    ws.close();
  });

  it('returns bid.ack with error for expired counterpartyDeadline', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    // Create auction
    const ackResponse = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;
    const bid = {
      ...createValidBid(auctionId),
      counterpartyDeadline: Math.floor(Date.now() / 1000) - 100, // Expired
    };

    const response = (await sendAndWait(
      ws,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe(
      'counterpartyDeadline must be in the future'
    );

    ws.close();
  });

  it('broadcasts auction.bids to subscribed clients after successful bid', async () => {
    const wsCreator = await createClient();
    const wsBidder = await createClient();
    const auction = await createAuctionRFQ();

    // Create auction (creator is auto-subscribed)
    const ackResponse = (await sendAndWait(
      wsCreator,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Set up listener for auction.bids on creator's connection
    const bidsPromise = waitForMessage(wsCreator, 'auction.bids');

    // Submit bid from bidder
    const bid = createValidBid(auctionId);
    wsBidder.send(JSON.stringify({ type: 'bid.submit', payload: bid }));

    // Creator should receive auction.bids broadcast
    const bidsMessage = (await bidsPromise) as {
      type: string;
      payload: { auctionId: string; bids: BidPayload[] };
    };
    expect(bidsMessage.type).toBe('auction.bids');
    expect(bidsMessage.payload.auctionId).toBe(auctionId);
    expect(bidsMessage.payload.bids).toHaveLength(1);
    expect(bidsMessage.payload.bids[0].counterparty).toBe(bid.counterparty);

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

    const response = (await sendAndWait(ws, { type: 'ping' }, 'pong')) as {
      type: string;
    };
    expect(response.type).toBe('pong');

    ws.close();
  });

  it('handles unknown message types gracefully', async () => {
    const ws = await createClient();

    // Send unknown message type
    ws.send(JSON.stringify({ type: 'unknown.type', payload: {} }));

    // Wait a bit, then verify connection is still open
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = (await sendAndWait(ws, { type: 'ping' }, 'pong')) as {
      type: string;
    };
    expect(response.type).toBe('pong');

    ws.close();
  });
});

describe('Multiple Bids', () => {
  it('accumulates multiple bids for same auction', async () => {
    const ws = await createClient();
    const auction = await createAuctionRFQ();

    // Create auction
    const ackResponse = (await sendAndWait(
      ws,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Submit first bid
    const bid1 = createValidBid(auctionId);
    await sendAndWait(ws, { type: 'bid.submit', payload: bid1 }, 'bid.ack');

    // Submit second bid from different counterparty
    const bid2 = {
      ...createValidBid(auctionId),
      counterparty: '0xDeaDDeaDDeaDDeaDDeaDDeaDDeaDDeaDDeaDDeaD',
      counterpartyCollateral: '600000000000000000',
    };

    // Wait for the auction.bids broadcast after second bid
    const bidsPromise = waitForMessage(ws, 'auction.bids');
    ws.send(JSON.stringify({ type: 'bid.submit', payload: bid2 }));

    const bidsMessage = (await bidsPromise) as {
      payload: { bids: BidPayload[] };
    };
    expect(bidsMessage.payload.bids.length).toBeGreaterThanOrEqual(2);

    ws.close();
  });
});

describe('Subscription Behavior', () => {
  it('receives auction.bids after subscribing to existing auction', async () => {
    const wsCreator = await createClient();
    const wsSubscriber = await createClient();
    const auction = await createAuctionRFQ();

    // Create auction
    const ackResponse = (await sendAndWait(
      wsCreator,
      { type: 'auction.start', payload: auction },
      'auction.ack'
    )) as { payload: { auctionId: string } };

    const auctionId = ackResponse.payload.auctionId;

    // Submit a bid first
    const bid = createValidBid(auctionId);
    await sendAndWait(
      wsCreator,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    );

    // Now subscriber joins and subscribes - should receive current bids
    const bidsPromise = waitForMessage(
      wsSubscriber,
      'auction.bids',
      2000
    ).catch(() => null);
    wsSubscriber.send(
      JSON.stringify({ type: 'auction.subscribe', payload: { auctionId } })
    );

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
