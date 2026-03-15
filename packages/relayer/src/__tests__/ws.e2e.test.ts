import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// Mocks MUST come before imports
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: '0',
    ENABLE_AUCTION_WS: true,
    SENTRY_DSN: '',
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_MESSAGES: 100,
    WS_IDLE_TIMEOUT_MS: 30000,
    WS_MAX_CONNECTIONS: 100,
    WS_ALLOWED_ORIGINS: '',
  },
  isProd: false,
  isDev: false,
}));
vi.mock('../instrument', () => ({
  default: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));

import WebSocket from 'ws';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { BidPayload, ValidatedBid } from '../escrowTypes';
import {
  createTestServer,
  createClient,
  waitForMessage,
  expectNoMessage,
  sendAndWait,
  startAuction,
  createSignedBid,
  TEST_CHAIN_ID,
  TEST_PICK,
} from './ws.e2e.helpers';

describe('Relayer E2E Auction Lifecycle', () => {
  let port: number;
  let cleanup: () => Promise<void>;
  const openClients: WebSocket[] = [];

  beforeAll(async () => {
    const server = await createTestServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterEach(() => {
    for (const ws of openClients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    openClients.length = 0;
  });

  afterAll(async () => {
    await cleanup();
  });

  /** Connect a client and track it for cleanup. */
  async function connect(): Promise<WebSocket> {
    const ws = await createClient(port);
    openClients.push(ws);
    return ws;
  }

  // ==========================================================================
  // 1. Full Lifecycle
  // ==========================================================================

  describe('Full Lifecycle', () => {
    it('1. predictor starts auction → maker receives auction.started → maker bids → predictor receives auction.bids', async () => {
      const predictor = await connect();
      const maker = await connect();

      // Maker listens for auction.started broadcast
      const startedPromise = waitForMessage(maker, 'auction.started');

      // Predictor starts auction (also receives auction.started itself)
      const { auctionId, auction } = await startAuction(predictor);
      expect(auctionId).toBeTruthy();

      // Maker should receive the auction.started broadcast
      const started = (await startedPromise) as {
        type: string;
        payload: {
          auctionId: string;
          picks: { predictedOutcome: number }[];
        };
      };
      expect(started.payload.auctionId).toBe(auctionId);

      // Verify predictedOutcome is preserved in the broadcast (YES = 0)
      expect(started.payload.picks).toHaveLength(1);
      expect(started.payload.picks[0].predictedOutcome).toBe(
        TEST_PICK.predictedOutcome
      );
      expect(started.payload.picks[0].predictedOutcome).toBe(0);

      // Maker creates and submits a signed bid
      const makerAccount = privateKeyToAccount(generatePrivateKey());
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      // Predictor waits for auction.bids (auto-subscribed from auction.start)
      const bidsPromise = waitForMessage(predictor, 'auction.bids');

      // Submit bid
      const bidAck = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(bidAck.payload.error).toBeUndefined();

      // Predictor should receive the bids broadcast
      const bidsMsg = (await bidsPromise) as {
        payload: { auctionId: string; bids: ValidatedBid[] };
      };
      expect(bidsMsg.payload.auctionId).toBe(auctionId);
      expect(bidsMsg.payload.bids).toHaveLength(1);
      expect(bidsMsg.payload.bids[0].counterparty.toLowerCase()).toBe(
        makerAccount.address.toLowerCase()
      );
    });
  });

  // ==========================================================================
  // 2. Multiple Competing Makers
  // ==========================================================================

  describe('Multiple Competing Makers', () => {
    it('2. three makers bid, predictor sees all bids accumulated', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      const makers = await Promise.all([connect(), connect(), connect()]);
      const makerAccounts = [
        privateKeyToAccount(generatePrivateKey()),
        privateKeyToAccount(generatePrivateKey()),
        privateKeyToAccount(generatePrivateKey()),
      ];

      // Collect all auction.bids messages on the predictor before submitting
      const collectedBids: ValidatedBid[][] = [];
      const collector = (data: WebSocket.RawData) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auction.bids') {
          collectedBids.push(msg.payload.bids);
        }
      };
      predictor.on('message', collector);

      // Each maker submits a bid with different collateral
      for (let i = 0; i < 3; i++) {
        const collateral = `${(i + 1) * 500000000000000000}`;
        const bid = await createSignedBid(
          {
            auctionId,
            picks: auction.picks,
            predictor: auction.predictor,
            predictorCollateral: auction.predictorCollateral,
            chainId: auction.chainId,
          },
          makerAccounts[i],
          { counterpartyCollateral: collateral }
        );
        const ack = (await sendAndWait(
          makers[i],
          { type: 'bid.submit', payload: bid },
          'bid.ack'
        )) as { payload: { error?: string } };
        expect(ack.payload.error).toBeUndefined();
      }

      // Allow broadcasts to arrive
      await new Promise((r) => setTimeout(r, 100));
      predictor.off('message', collector);

      // The last broadcast should have all 3 bids accumulated
      const lastBatch = collectedBids[collectedBids.length - 1];
      expect(lastBatch).toHaveLength(3);
    });
  });

  // ==========================================================================
  // 3. Late Subscriber
  // ==========================================================================

  describe('Late Subscriber', () => {
    it('3. client connects after bids exist, subscribes, gets current bids', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      // Maker submits a bid
      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeUndefined();

      // Wait for predictor to receive the bid broadcast (confirms it's stored)
      await waitForMessage(predictor, 'auction.bids');

      // Late subscriber connects and subscribes
      const late = await connect();
      const bidsPromise = waitForMessage(late, 'auction.bids');

      late.send(
        JSON.stringify({
          type: 'auction.subscribe',
          payload: { auctionId },
        })
      );

      // Late subscriber should receive current bids
      const bidsMsg = (await bidsPromise) as {
        payload: { auctionId: string; bids: ValidatedBid[] };
      };
      expect(bidsMsg.payload.auctionId).toBe(auctionId);
      expect(bidsMsg.payload.bids).toHaveLength(1);
      expect(bidsMsg.payload.bids[0].counterparty.toLowerCase()).toBe(
        makerAccount.address.toLowerCase()
      );
    });
  });

  // ==========================================================================
  // 4. Combo (Multi-Pick)
  // ==========================================================================

  describe('Combo (Multi-Pick)', () => {
    it('4. auction with 2+ picks, maker signs covering all', async () => {
      const predictor = await connect();

      const PICK_2 = {
        conditionResolver: '0x2234567890123456789012345678901234567890',
        conditionId: '0x' + 'cd'.repeat(32),
        predictedOutcome: 1,
      };

      const { auctionId, auction } = await startAuction(predictor, {
        picks: [
          {
            conditionResolver: TEST_PICK.conditionResolver,
            conditionId: TEST_PICK.conditionId,
            predictedOutcome: TEST_PICK.predictedOutcome,
          },
          PICK_2,
        ],
      });

      expect(auction.picks).toHaveLength(2);

      // Verify predictedOutcome values are preserved (YES=0, NO=1)
      expect(auction.picks[0].predictedOutcome).toBe(0); // TEST_PICK → YES
      expect(auction.picks[1].predictedOutcome).toBe(1); // PICK_2 → NO

      // Maker signs bid covering both picks
      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      const bidsPromise = waitForMessage(predictor, 'auction.bids');

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeUndefined();

      const bidsMsg = (await bidsPromise) as {
        payload: { auctionId: string; bids: ValidatedBid[] };
      };
      expect(bidsMsg.payload.bids).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 5–6, 10–11. Validation Enforcement
  // ==========================================================================

  describe('Validation Enforcement', () => {
    it('5. expired deadline rejected', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());

      // Create bid with a past deadline
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount,
        { counterpartyDeadline: Math.floor(Date.now() / 1000) - 60 }
      );

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeTruthy();
      expect(ack.payload.error).toContain('Deadline');
    });

    it('6. non-existent auction rejected', async () => {
      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());

      // Submit bid for a fake auctionId (need valid fields to pass field checks)
      const bid: BidPayload = {
        auctionId: 'non-existent-auction-id',
        counterparty: makerAccount.address,
        counterpartyCollateral: '500000000000000000',
        counterpartyNonce: 1,
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
        counterpartySignature: '0x' + 'ab'.repeat(65),
      };

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBe('auction_not_found_or_expired');
    });

    it('10. malformed RFQ (missing fields) rejected at auction.start', async () => {
      const client = await connect();

      // Send auction.start with empty picks array
      const response = (await sendAndWait(
        client,
        {
          type: 'auction.start',
          payload: {
            picks: [],
            predictor: '0x1234567890123456789012345678901234567890',
            predictorCollateral: '1000000000000000000',
            predictorNonce: 1,
            predictorDeadline: Math.floor(Date.now() / 1000) + 3600,
            intentSignature: '0x' + 'ab'.repeat(65),
            chainId: TEST_CHAIN_ID,
          },
        },
        'auction.ack'
      )) as { payload: { auctionId: string; error?: string } };

      expect(response.payload.error).toBeTruthy();
    });

    it('11. tampered counterparty passes through as unverified (could be smart contract signer)', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());

      // Create a correctly signed bid
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      // Tamper: change the counterparty to a different address.
      // Without a publicClient the relayer can't distinguish this from a
      // valid ERC-1271 smart-contract signature, so validateBid returns
      // 'unverified' and the relayer passes it through — the on-chain
      // contract is the ultimate authority on signature validity.
      const differentAddress =
        privateKeyToAccount(generatePrivateKey()).address;
      bid.counterparty = differentAddress;

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeUndefined();
    });
  });

  // ==========================================================================
  // 7–8. Subscription Management
  // ==========================================================================

  describe('Subscription Management', () => {
    it('7. unsubscribe stops delivery', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      // Predictor unsubscribes
      const unsubAck = (await sendAndWait(
        predictor,
        { type: 'auction.unsubscribe', payload: { auctionId } },
        'auction.ack'
      )) as { payload: { unsubscribed?: boolean } };
      expect(unsubAck.payload.unsubscribed).toBe(true);

      // Maker submits a bid
      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeUndefined();

      // Predictor should NOT receive auction.bids
      await expectNoMessage(predictor, 'auction.bids', 500);
    });

    it('8. predictor disconnect + reconnect — bids accumulate', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      // Predictor disconnects
      predictor.close();
      await new Promise<void>((resolve) => {
        predictor.on('close', () => resolve());
      });

      // Maker submits a bid while predictor is disconnected
      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount
      );

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack.payload.error).toBeUndefined();

      // New client connects and subscribes to the auction
      const newClient = await connect();
      const bidsPromise = waitForMessage(newClient, 'auction.bids');

      newClient.send(
        JSON.stringify({
          type: 'auction.subscribe',
          payload: { auctionId },
        })
      );

      // New client should receive accumulated bids
      const bidsMsg = (await bidsPromise) as {
        payload: { auctionId: string; bids: ValidatedBid[] };
      };
      expect(bidsMsg.payload.auctionId).toBe(auctionId);
      expect(bidsMsg.payload.bids).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 9. Duplicate Bids
  // ==========================================================================

  describe('Duplicate Bids', () => {
    it('9. same maker bids twice — both bids preserved (different sigs)', async () => {
      const predictor = await connect();
      const { auctionId, auction } = await startAuction(predictor);

      const maker = await connect();
      const makerAccount = privateKeyToAccount(generatePrivateKey());

      // Collect all auction.bids messages on the predictor before submitting
      const collectedBids: ValidatedBid[][] = [];
      const collector = (data: WebSocket.RawData) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auction.bids') {
          collectedBids.push(msg.payload.bids);
        }
      };
      predictor.on('message', collector);

      // First bid
      const bid1 = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount,
        {
          counterpartyNonce: 1000,
          counterpartyCollateral: '500000000000000000',
        }
      );

      const ack1 = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid1 },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack1.payload.error).toBeUndefined();

      // Wait for the first broadcast to arrive
      await new Promise((r) => setTimeout(r, 100));

      // Second bid with a different nonce (produces different signature)
      const bid2 = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        makerAccount,
        {
          counterpartyNonce: 2000,
          counterpartyCollateral: '600000000000000000',
        }
      );

      const ack2 = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid2 },
        'bid.ack'
      )) as { payload: { error?: string } };
      expect(ack2.payload.error).toBeUndefined();

      // Wait for the second broadcast to arrive
      await new Promise((r) => setTimeout(r, 100));
      predictor.off('message', collector);

      // The last auction.bids message should have both bids
      const lastBids = collectedBids[collectedBids.length - 1];
      expect(lastBids).toHaveLength(2);
      // Both from the same maker
      expect(lastBids[0].counterparty.toLowerCase()).toBe(
        makerAccount.address.toLowerCase()
      );
      expect(lastBids[1].counterparty.toLowerCase()).toBe(
        makerAccount.address.toLowerCase()
      );
    });
  });

  // ==========================================================================
  // 12. Unverified Bid Pass-Through
  // ==========================================================================

  describe('Unverified Bid Pass-Through', () => {
    it('12. bid with unrecoverable signature relayed as pass-through', async () => {
      const predictor = await connect();
      const { auctionId } = await startAuction(predictor);

      const maker = await connect();

      // We need a bid where ecrecover FAILS (throws) so that
      // verifyCounterpartyMintSignature returns { valid: false } without
      // recoveredAddress. Then validateBid returns 'unverified' and the
      // relayer passes it through.
      //
      // Strategy: create a valid bid structure but use a garbled signature
      // that is valid hex and long enough to pass format checks but will
      // cause ecrecover to fail (not a valid ECDSA signature).
      const scCounterparty = privateKeyToAccount(generatePrivateKey()).address;

      const bid: BidPayload = {
        auctionId,
        counterparty: scCounterparty,
        counterpartyCollateral: '500000000000000000',
        counterpartyNonce: Math.floor(Math.random() * 1_000_000),
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
        // A signature with an invalid v value (not 27 or 28) causes ecrecover
        // to throw in viem, producing no recoveredAddress → 'unverified'
        counterpartySignature:
          '0x' +
          'aa'.repeat(32) + // r
          'bb'.repeat(32) + // s
          'ff', // v = 0xff (invalid — must be 1b or 1c)
      };

      // Listen for the bid to be broadcast to the predictor
      const bidsPromise = waitForMessage(predictor, 'auction.bids');

      const ack = (await sendAndWait(
        maker,
        { type: 'bid.submit', payload: bid },
        'bid.ack'
      )) as { payload: { error?: string } };

      // 'unverified' bids pass through — no error
      expect(ack.payload.error).toBeUndefined();

      // Predictor should receive the bid
      const bidsMsg = (await bidsPromise) as {
        payload: { auctionId: string; bids: ValidatedBid[] };
      };
      expect(bidsMsg.payload.bids).toHaveLength(1);
      expect(bidsMsg.payload.bids[0].counterparty.toLowerCase()).toBe(
        scCounterparty.toLowerCase()
      );
    });
  });
});
