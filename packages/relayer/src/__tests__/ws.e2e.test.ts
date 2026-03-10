import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { type Address } from 'viem';
import { createCounterpartyBid } from '@sapience/sdk/auction/escrowSigning';
import type {
  AuctionRFQPayload,
  BidPayload,
  AuctionDetails,
  ValidatedBid,
  PickJson,
} from '../escrowTypes';

// ---------------------------------------------------------------------------
// Test server setup (same pattern as ws.integration.test.ts)
// ---------------------------------------------------------------------------

let httpServer: Server;
let wss: ReturnType<typeof createAuctionWebSocketServer>;
let serverPort: number;

function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}/auction`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

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

/** Expect NO message of a given type within `ms` milliseconds. */
function expectNoMessage(ws: WebSocket, unexpectedType: string, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      resolve();
    }, ms);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === unexpectedType) {
        clearTimeout(timer);
        ws.off('message', handler);
        reject(new Error(`Unexpectedly received message type: ${unexpectedType}`));
      }
    };

    ws.on('message', handler);
  });
}

async function sendAndWait(
  ws: WebSocket,
  message: unknown,
  expectedResponseType: string
): Promise<unknown> {
  const responsePromise = waitForMessage(ws, expectedResponseType);
  ws.send(JSON.stringify(message));
  return responsePromise;
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_CHAIN_ID = 5064014;
const TEST_VERIFYING_CONTRACT = '0x1111111111111111111111111111111111111111' as Address;

const TEST_PICK: PickJson = {
  conditionResolver: '0x1234567890123456789012345678901234567890',
  conditionId: '0x' + 'ab'.repeat(32),
  predictedOutcome: 0,
};

const TEST_PICK_2: PickJson = {
  conditionResolver: '0x1234567890123456789012345678901234567890',
  conditionId: '0x' + 'cd'.repeat(32),
  predictedOutcome: 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAuctionRFQ(
  predictor: Address,
  overrides?: Partial<AuctionRFQPayload>
): AuctionRFQPayload {
  return {
    picks: [TEST_PICK],
    predictorCollateral: '1000000000000000000',
    predictor,
    predictorNonce: Math.floor(Math.random() * 1000000),
    predictorDeadline: Math.floor(Date.now() / 1000) + 3600,
    intentSignature: '0x' + 'aa'.repeat(65),
    chainId: TEST_CHAIN_ID,
    ...overrides,
  };
}

/**
 * Create a signed bid using the SDK's createCounterpartyBid.
 */
function createSignedBid(
  auction: AuctionDetails,
  counterpartyAccount: ReturnType<typeof privateKeyToAccount>,
  counterpartyCollateral: string = '500000000000000000'
): Promise<BidPayload> {
  return createCounterpartyBid({
    auction,
    counterparty: counterpartyAccount.address,
    counterpartyCollateral: BigInt(counterpartyCollateral),
    verifyingContract: TEST_VERIFYING_CONTRACT,
    chainId: TEST_CHAIN_ID,
    signTypedData: counterpartyAccount.signTypedData,
  });
}

/**
 * Start an auction and return the auctionId + auction details.
 */
async function startAuction(
  ws: WebSocket,
  predictor: Address,
  overrides?: Partial<AuctionRFQPayload>
): Promise<{ auctionId: string; details: AuctionDetails }> {
  const rfq = createAuctionRFQ(predictor, overrides);

  // Listen for auction.started broadcast (sent to all clients including sender)
  const startedPromise = waitForMessage(ws, 'auction.started');

  const ack = (await sendAndWait(
    ws,
    { type: 'auction.start', payload: rfq },
    'auction.ack'
  )) as { payload: { auctionId: string } };

  const started = (await startedPromise) as { payload: AuctionDetails };

  return { auctionId: ack.payload.auctionId, details: started.payload };
}

/**
 * Submit a signed bid and wait for ack + predictor broadcast.
 * Returns the auction.bids message the predictor received.
 */
async function submitBidAndDrain(
  wsMaker: WebSocket,
  wsPredictor: WebSocket,
  bid: BidPayload
): Promise<{ payload: { auctionId: string; bids: ValidatedBid[] } }> {
  const bidsPromise = waitForMessage(wsPredictor, 'auction.bids');
  await sendAndWait(wsMaker, { type: 'bid.submit', payload: bid }, 'bid.ack');
  return bidsPromise as Promise<{ payload: { auctionId: string; bids: ValidatedBid[] } }>;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  httpServer = createServer();
  wss = createAuctionWebSocketServer();

  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  for (const client of wss.clients) {
    client.close();
  }
  await new Promise<void>((resolve) => {
    wss.close(() => {
      httpServer.close(() => resolve());
    });
  });
});

// ---------------------------------------------------------------------------
// E2E Tests
// ---------------------------------------------------------------------------

describe('E2E: Full Auction Lifecycle', () => {
  it('predictor starts auction -> maker signs & bids -> predictor receives bid with all fields', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    // Maker listens for auction.started
    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');

    // Predictor starts auction
    const { auctionId } = await startAuction(wsPredictor, predictorAccount.address);

    // Maker receives auction.started — verify full payload fidelity
    const auctionStarted = (await auctionStartedPromise) as { payload: AuctionDetails };
    const details = auctionStarted.payload;
    expect(details.auctionId).toBe(auctionId);
    expect(details.predictor).toBe(predictorAccount.address);
    expect(details.predictorCollateral).toBe('1000000000000000000');
    expect(details.chainId).toBe(TEST_CHAIN_ID);
    expect(details.picks).toHaveLength(1);
    expect(details.picks[0].conditionId).toBe(TEST_PICK.conditionId);
    expect(details.picks[0].conditionResolver).toBe(TEST_PICK.conditionResolver);
    expect(details.picks[0].predictedOutcome).toBe(TEST_PICK.predictedOutcome);
    expect(details.predictorNonce).toBeTypeOf('number');
    expect(details.predictorDeadline).toBeTypeOf('number');
    expect(details.createdAt).toBeTruthy();

    // Predictor listens for bids
    const bidsPromise = waitForMessage(wsPredictor, 'auction.bids');

    // Maker signs and submits bid
    const bid = await createSignedBid(auctionStarted.payload, makerAccount);
    const bidAck = (await sendAndWait(
      wsMaker,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { payload: { error?: string } };
    expect(bidAck.payload.error).toBeUndefined();

    // Predictor receives bid broadcast — verify all ValidatedBid fields
    const bidsMsg = (await bidsPromise) as {
      payload: { auctionId: string; bids: ValidatedBid[] };
    };
    expect(bidsMsg.payload.auctionId).toBe(auctionId);
    expect(bidsMsg.payload.bids).toHaveLength(1);

    const receivedBid = bidsMsg.payload.bids[0];
    expect(receivedBid.counterparty).toBe(makerAccount.address);
    expect(receivedBid.counterpartyCollateral).toBe('500000000000000000');
    expect(receivedBid.counterpartySignature).toMatch(/^0x[0-9a-f]+$/i);
    expect(receivedBid.counterpartyNonce).toBe(bid.counterpartyNonce);
    expect(receivedBid.counterpartyDeadline).toBe(bid.counterpartyDeadline);
    expect(receivedBid.receivedAt).toBeTruthy();
    // receivedAt should be a valid ISO timestamp close to now
    const receivedAtMs = new Date(receivedBid.receivedAt).getTime();
    expect(Math.abs(Date.now() - receivedAtMs)).toBeLessThan(5000);

    wsPredictor.close();
    wsMaker.close();
  });

  it('multiple makers compete — predictor sees all bids accumulated', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const maker1 = privateKeyToAccount(generatePrivateKey());
    const maker2 = privateKeyToAccount(generatePrivateKey());
    const maker3 = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker1 = await createClient();
    const wsMaker2 = await createClient();
    const wsMaker3 = await createClient();

    // All makers listen for auction.started
    const started1 = waitForMessage(wsMaker1, 'auction.started');
    const started2 = waitForMessage(wsMaker2, 'auction.started');
    const started3 = waitForMessage(wsMaker3, 'auction.started');

    const { auctionId } = await startAuction(wsPredictor, predictorAccount.address);

    const [s1, s2, s3] = (await Promise.all([started1, started2, started3])) as {
      payload: AuctionDetails;
    }[];

    // Submit bids sequentially, draining predictor broadcasts between each
    const bid1 = await createSignedBid(s1.payload, maker1, '100000000000000000');
    await submitBidAndDrain(wsMaker1, wsPredictor, bid1);

    const bid2 = await createSignedBid(s2.payload, maker2, '200000000000000000');
    await submitBidAndDrain(wsMaker2, wsPredictor, bid2);

    const bid3 = await createSignedBid(s3.payload, maker3, '300000000000000000');
    const finalBids = await submitBidAndDrain(wsMaker3, wsPredictor, bid3);

    expect(finalBids.payload.auctionId).toBe(auctionId);
    expect(finalBids.payload.bids).toHaveLength(3);

    const counterparties = finalBids.payload.bids.map((b) => b.counterparty);
    expect(counterparties).toContain(maker1.address);
    expect(counterparties).toContain(maker2.address);
    expect(counterparties).toContain(maker3.address);

    // Verify each bid has distinct collateral amounts
    const collaterals = finalBids.payload.bids.map((b) => b.counterpartyCollateral);
    expect(collaterals).toContain('100000000000000000');
    expect(collaterals).toContain('200000000000000000');
    expect(collaterals).toContain('300000000000000000');

    wsPredictor.close();
    wsMaker1.close();
    wsMaker2.close();
    wsMaker3.close();
  });

  it('late subscriber gets existing bids', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const maker1 = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker1 = await createClient();

    // Maker1 listens for auction
    const started1 = waitForMessage(wsMaker1, 'auction.started');

    const { auctionId } = await startAuction(wsPredictor, predictorAccount.address);
    const s1 = (await started1) as { payload: AuctionDetails };

    // Maker1 submits bid
    const bid1 = await createSignedBid(s1.payload, maker1);
    await submitBidAndDrain(wsMaker1, wsPredictor, bid1);

    // Late client connects and subscribes — should receive current bids
    const wsLate = await createClient();
    const bidsOnSubscribe = waitForMessage(wsLate, 'auction.bids', 3000);
    wsLate.send(JSON.stringify({ type: 'auction.subscribe', payload: { auctionId } }));

    const existingBids = (await bidsOnSubscribe) as {
      payload: { auctionId: string; bids: ValidatedBid[] };
    };
    expect(existingBids.payload.auctionId).toBe(auctionId);
    expect(existingBids.payload.bids).toHaveLength(1);
    expect(existingBids.payload.bids[0].counterparty).toBe(maker1.address);

    wsPredictor.close();
    wsMaker1.close();
    wsLate.close();
  });

  it('parlay (multi-pick) auction — maker signs bid covering all picks', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');

    // Start auction with 2 picks (parlay)
    const { auctionId } = await startAuction(wsPredictor, predictorAccount.address, {
      picks: [TEST_PICK, TEST_PICK_2],
    });

    const auctionStarted = (await auctionStartedPromise) as { payload: AuctionDetails };
    expect(auctionStarted.payload.picks).toHaveLength(2);
    // Verify both picks are present with correct data
    expect(auctionStarted.payload.picks[0].conditionId).toBe(TEST_PICK.conditionId);
    expect(auctionStarted.payload.picks[1].conditionId).toBe(TEST_PICK_2.conditionId);
    expect(auctionStarted.payload.picks[1].predictedOutcome).toBe(1);

    // Listen for bids on predictor side
    const bidsPromise = waitForMessage(wsPredictor, 'auction.bids');

    // Maker signs bid covering both picks
    const bid = await createSignedBid(auctionStarted.payload, makerAccount);
    const bidAck = (await sendAndWait(
      wsMaker,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { payload: { error?: string } };
    expect(bidAck.payload.error).toBeUndefined();

    const bidsMsg = (await bidsPromise) as {
      payload: { auctionId: string; bids: ValidatedBid[] };
    };
    expect(bidsMsg.payload.auctionId).toBe(auctionId);
    expect(bidsMsg.payload.bids).toHaveLength(1);
    expect(bidsMsg.payload.bids[0].counterparty).toBe(makerAccount.address);

    wsPredictor.close();
    wsMaker.close();
  });

  it('expired deadline rejected', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');

    await startAuction(wsPredictor, predictorAccount.address);
    const auctionStarted = (await auctionStartedPromise) as { payload: AuctionDetails };

    // Create a bid with an expired deadline
    const bid = await createSignedBid(auctionStarted.payload, makerAccount);
    bid.counterpartyDeadline = Math.floor(Date.now() / 1000) - 100; // past

    const bidAck = (await sendAndWait(
      wsMaker,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { payload: { error?: string } };
    expect(bidAck.payload.error).toBe('counterpartyDeadline must be in the future');

    wsPredictor.close();
    wsMaker.close();
  });

  it('non-existent auction rejected', async () => {
    const makerAccount = privateKeyToAccount(generatePrivateKey());
    const wsMaker = await createClient();

    // Submit bid for a fake auction
    const fakeBid: BidPayload = {
      auctionId: '00000000-0000-0000-0000-000000000000',
      counterparty: makerAccount.address,
      counterpartyCollateral: '500000000000000000',
      counterpartyNonce: 0,
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
      counterpartySignature: '0x' + 'bb'.repeat(65),
    };

    const bidAck = (await sendAndWait(
      wsMaker,
      { type: 'bid.submit', payload: fakeBid },
      'bid.ack'
    )) as { payload: { error?: string } };
    expect(bidAck.payload.error).toBe('auction_not_found_or_expired');

    wsMaker.close();
  });
});

describe('E2E: Subscription Lifecycle', () => {
  it('unsubscribe stops bid delivery', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');
    const { auctionId, details } = await startAuction(wsPredictor, predictorAccount.address);
    await auctionStartedPromise;

    // Predictor unsubscribes
    await sendAndWait(
      wsPredictor,
      { type: 'auction.unsubscribe', payload: { auctionId } },
      'auction.ack'
    );

    // Maker submits a bid — predictor should NOT receive auction.bids
    const bid = await createSignedBid(details, makerAccount);
    await sendAndWait(wsMaker, { type: 'bid.submit', payload: bid }, 'bid.ack');

    // Verify predictor does NOT get the broadcast
    await expectNoMessage(wsPredictor, 'auction.bids', 300);

    wsPredictor.close();
    wsMaker.close();
  });

  it('predictor disconnect — bids accumulate and new subscriber gets them', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');
    const { auctionId, details } = await startAuction(wsPredictor, predictorAccount.address);
    await auctionStartedPromise;

    // Predictor disconnects
    wsPredictor.close();
    // Small delay to let close propagate
    await new Promise((r) => setTimeout(r, 50));

    // Maker still bids (bid should succeed even though predictor is gone)
    const bid = await createSignedBid(details, makerAccount);
    const bidAck = (await sendAndWait(
      wsMaker,
      { type: 'bid.submit', payload: bid },
      'bid.ack'
    )) as { payload: { error?: string } };
    expect(bidAck.payload.error).toBeUndefined();

    // New client subscribes and gets the accumulated bid
    const wsNewSubscriber = await createClient();
    const bidsOnSubscribe = waitForMessage(wsNewSubscriber, 'auction.bids', 3000);
    wsNewSubscriber.send(JSON.stringify({ type: 'auction.subscribe', payload: { auctionId } }));

    const existingBids = (await bidsOnSubscribe) as {
      payload: { auctionId: string; bids: ValidatedBid[] };
    };
    expect(existingBids.payload.bids).toHaveLength(1);
    expect(existingBids.payload.bids[0].counterparty).toBe(makerAccount.address);

    wsMaker.close();
    wsNewSubscriber.close();
  });

  it('same maker can bid twice on same auction', async () => {
    const predictorAccount = privateKeyToAccount(generatePrivateKey());
    const makerAccount = privateKeyToAccount(generatePrivateKey());

    const wsPredictor = await createClient();
    const wsMaker = await createClient();

    const auctionStartedPromise = waitForMessage(wsMaker, 'auction.started');
    const { details } = await startAuction(wsPredictor, predictorAccount.address);
    await auctionStartedPromise;

    // First bid
    const bid1 = await createSignedBid(details, makerAccount, '100000000000000000');
    await submitBidAndDrain(wsMaker, wsPredictor, bid1);

    // Second bid from same maker with different collateral
    const bid2 = await createSignedBid(details, makerAccount, '200000000000000000');
    const finalBids = await submitBidAndDrain(wsMaker, wsPredictor, bid2);

    expect(finalBids.payload.bids).toHaveLength(2);
    // Both bids are from the same maker
    expect(finalBids.payload.bids[0].counterparty).toBe(makerAccount.address);
    expect(finalBids.payload.bids[1].counterparty).toBe(makerAccount.address);
    // But have different collaterals
    const collaterals = finalBids.payload.bids.map((b) => b.counterpartyCollateral).sort();
    expect(collaterals).toEqual(['100000000000000000', '200000000000000000']);

    wsPredictor.close();
    wsMaker.close();
  });
});
