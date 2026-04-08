/**
 * Hardening tests — per-IP connection limits, validation failure penalties,
 * malformed message penalties, and escrow bid caps.
 *
 * Tests written FIRST (TDD) — implementations follow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: '0',
    ENABLE_AUCTION_WS: true,
    SENTRY_DSN: '',
    RATE_LIMIT_WINDOW_MS: 60_000, // generous so rate limit doesn't interfere
    RATE_LIMIT_MAX_MESSAGES: 500,
    WS_IDLE_TIMEOUT_MS: 60_000,
    WS_MAX_CONNECTIONS: 50,
    WS_ALLOWED_ORIGINS: '',
    WS_MAX_CONNECTIONS_PER_IP: 3,
    WS_MAX_VALIDATION_FAILURES: 5,
    WS_MAX_INVALID_MESSAGES: 10,
    MAX_BIDS_PER_ESCROW_AUCTION: 50,
  },
  isProd: false,
  isDev: false,
}));

vi.mock('../instrument', () => ({
  default: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));

import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';
import {
  createClient as createE2eClient,
  startAuction,
  createSignedBid,
} from './ws.e2e.helpers';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { OutcomeSide } from '@sapience/sdk/types';

// ============================================================================
// Test infrastructure
// ============================================================================

const openClients: WebSocket[] = [];

function waitForClose(
  ws: WebSocket,
  timeout = 5000
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for close')),
      timeout
    );
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason?.toString() ?? '' });
    });
  });
}

function waitForMsg(
  ws: WebSocket,
  expectedType: string,
  timeout = 5000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Timeout waiting for message type: ${expectedType}`)),
      timeout
    );
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

// ============================================================================
// 1. Per-IP Connection Limit
// ============================================================================

describe('Per-IP Connection Limit', () => {
  let httpServer: Server;
  let wss: ReturnType<typeof createAuctionWebSocketServer>;
  let port: number;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of clients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    clients.length = 0;

    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/auction`);
      ws.on('open', () => {
        clients.push(ws);
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('accepts connections up to per-IP limit', async () => {
    // WS_MAX_CONNECTIONS_PER_IP = 3
    for (let i = 0; i < 3; i++) {
      const ws = await connect();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }
  });

  it('rejects with "ip_connection_limit" when per-IP limit exceeded', async () => {
    // Fill up to per-IP limit (3)
    for (let i = 0; i < 3; i++) {
      await connect();
    }

    // 4th from same IP should be rejected
    const ws4 = new WebSocket(`ws://localhost:${port}/auction`);
    clients.push(ws4);
    const { code, reason } = await waitForClose(ws4);
    expect(code).toBe(1008);
    expect(reason).toBe('ip_connection_limit');
  });

  it('allows new connection from same IP after one disconnects', async () => {
    // Fill up to limit
    const conns: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      conns.push(await connect());
    }

    // Close one and wait
    const closeP = new Promise<void>((resolve) => {
      conns[0].on('close', () => resolve());
    });
    conns[0].close();
    await closeP;
    await new Promise((r) => setTimeout(r, 50));

    // New connection should succeed
    const newWs = await connect();
    expect(newWs.readyState).toBe(WebSocket.OPEN);
  });

  it('tracks IPs independently — limit applies per IP not globally', async () => {
    // This test confirms the global limit (50) is separate from per-IP (3).
    // We can open 3 from localhost — the global limit is still far away.
    for (let i = 0; i < 3; i++) {
      const ws = await connect();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }
    // 4th is rejected by per-IP, not global
    const ws4 = new WebSocket(`ws://localhost:${port}/auction`);
    clients.push(ws4);
    const { reason } = await waitForClose(ws4);
    expect(reason).toBe('ip_connection_limit');
  });
});

// ============================================================================
// 2. Validation Failure Penalty (bad signatures → disconnect)
// ============================================================================

describe('Validation Failure Penalty', () => {
  let httpServer: Server;
  let wss: ReturnType<typeof createAuctionWebSocketServer>;
  let port: number;

  beforeEach(async () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of openClients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    openClients.length = 0;

    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/auction`);
      ws.on('open', () => {
        openClients.push(ws);
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('disconnects after WS_MAX_VALIDATION_FAILURES bad auction signatures', async () => {
    const ws = await connect();
    const closePromise = waitForClose(ws);

    // Send auction.start payloads with bogus signatures (valid structure, wrong sig)
    for (let i = 0; i < 6; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(
        JSON.stringify({
          type: 'auction.start',
          payload: {
            picks: [
              {
                conditionResolver: '0x1234567890123456789012345678901234567890',
                conditionId: '0x' + 'ab'.repeat(32),
                predictedOutcome: OutcomeSide.YES,
              },
            ],
            predictorCollateral: '1000000000000000000',
            predictor: '0x1234567890123456789012345678901234567890',
            predictorNonce: i,
            predictorDeadline: Math.floor(Date.now() / 1000) + 3600,
            intentSignature: '0x' + 'ff'.repeat(65),
            chainId: 5064014,
          },
        })
      );
      await new Promise((r) => setTimeout(r, 50));
    }

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('too_many_validation_failures');
  });

  it('does not disconnect for validation failures below the threshold', async () => {
    const ws = await connect();

    // Send fewer than WS_MAX_VALIDATION_FAILURES (5) bad payloads
    for (let i = 0; i < 4; i++) {
      ws.send(
        JSON.stringify({
          type: 'auction.start',
          payload: {
            picks: [
              {
                conditionResolver: '0x1234567890123456789012345678901234567890',
                conditionId: '0x' + 'ab'.repeat(32),
                predictedOutcome: OutcomeSide.YES,
              },
            ],
            predictorCollateral: '1000000000000000000',
            predictor: '0x1234567890123456789012345678901234567890',
            predictorNonce: i,
            predictorDeadline: Math.floor(Date.now() / 1000) + 3600,
            intentSignature: '0x' + 'ff'.repeat(65),
            chainId: 5064014,
          },
        })
      );
      await new Promise((r) => setTimeout(r, 50));
    }

    // Wait a bit, then verify connection is still open
    await new Promise((r) => setTimeout(r, 500));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Valid ping should still work
    ws.send(JSON.stringify({ type: 'ping' }));
    const resp = await waitForMsg(ws, 'pong');
    expect(resp.type).toBe('pong');
  });
});

// ============================================================================
// 3. Malformed Message Penalty (garbage → disconnect)
// ============================================================================

describe('Malformed Message Penalty', () => {
  let httpServer: Server;
  let wss: ReturnType<typeof createAuctionWebSocketServer>;
  let port: number;

  beforeEach(async () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of openClients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    openClients.length = 0;

    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/auction`);
      ws.on('open', () => {
        openClients.push(ws);
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('disconnects after WS_MAX_INVALID_MESSAGES invalid JSON messages', async () => {
    const ws = await connect();
    const closePromise = waitForClose(ws);

    // Send 11 invalid JSON messages (limit is 10)
    for (let i = 0; i < 11; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send('this is not json ' + i);
      await new Promise((r) => setTimeout(r, 20));
    }

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('too_many_invalid_messages');
  });

  it('disconnects after WS_MAX_INVALID_MESSAGES unhandled message types', async () => {
    const ws = await connect();
    const closePromise = waitForClose(ws);

    for (let i = 0; i < 11; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(JSON.stringify({ type: `garbage.type.${i}` }));
      await new Promise((r) => setTimeout(r, 20));
    }

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('too_many_invalid_messages');
  });

  it('counts missing payload as an invalid message', async () => {
    const ws = await connect();
    const closePromise = waitForClose(ws);

    // Send messages with valid type but missing payload
    for (let i = 0; i < 11; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(JSON.stringify({ type: 'auction.start' }));
      await new Promise((r) => setTimeout(r, 20));
    }

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('too_many_invalid_messages');
  });

  it('does not disconnect below the threshold', async () => {
    const ws = await connect();

    // Send 9 invalid messages (under limit of 10)
    for (let i = 0; i < 9; i++) {
      ws.send('not json ' + i);
      await new Promise((r) => setTimeout(r, 20));
    }

    await new Promise((r) => setTimeout(r, 300));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Valid message should still work
    ws.send(JSON.stringify({ type: 'ping' }));
    const resp = await waitForMsg(ws, 'pong');
    expect(resp.type).toBe('pong');
  });
});

// ============================================================================
// 4. Escrow Bid Cap
// ============================================================================

describe('Escrow Bid Cap', () => {
  let httpServer: Server;
  let wss: ReturnType<typeof createAuctionWebSocketServer>;
  let port: number;

  beforeEach(async () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of openClients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    openClients.length = 0;

    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  function connect(): Promise<WebSocket> {
    return createE2eClient(port).then((ws) => {
      openClients.push(ws);
      return ws;
    });
  }

  it('rejects bids beyond MAX_BIDS_PER_ESCROW_AUCTION with bid_limit_reached', async () => {
    const predictorWs = await connect();
    const bidderWs = await connect();

    // Start an auction
    const { auctionId, auction } = await startAuction(predictorWs);

    // Submit MAX_BIDS_PER_ESCROW_AUCTION (50) bids — all should be accepted
    let accepted = 0;
    let rejected = 0;

    for (let i = 0; i < 52; i++) {
      const counterpartyKey = generatePrivateKey();
      const counterpartyAccount = privateKeyToAccount(counterpartyKey);

      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        counterpartyAccount
      );

      bidderWs.send(JSON.stringify({ type: 'bid.submit', payload: bid }));

      const ack = (await waitForMsg(bidderWs, 'bid.ack')) as {
        payload: { error?: string };
      };

      if (ack.payload.error) {
        rejected++;
      } else {
        accepted++;
      }
    }

    // First 50 accepted, last 2 rejected with bid_limit_reached
    expect(accepted).toBe(50);
    expect(rejected).toBe(2);
  }, 30_000);

  it('returns bid_limit_reached error in bid.ack', async () => {
    const predictorWs = await connect();
    const bidderWs = await connect();

    const { auctionId, auction } = await startAuction(predictorWs);

    // Fill to cap
    for (let i = 0; i < 50; i++) {
      const key = generatePrivateKey();
      const account = privateKeyToAccount(key);
      const bid = await createSignedBid(
        {
          auctionId,
          picks: auction.picks,
          predictor: auction.predictor,
          predictorCollateral: auction.predictorCollateral,
          chainId: auction.chainId,
        },
        account
      );
      bidderWs.send(JSON.stringify({ type: 'bid.submit', payload: bid }));
      await waitForMsg(bidderWs, 'bid.ack');
    }

    // 51st bid should fail
    const extraKey = generatePrivateKey();
    const extraAccount = privateKeyToAccount(extraKey);
    const extraBid = await createSignedBid(
      {
        auctionId,
        picks: auction.picks,
        predictor: auction.predictor,
        predictorCollateral: auction.predictorCollateral,
        chainId: auction.chainId,
      },
      extraAccount
    );
    bidderWs.send(JSON.stringify({ type: 'bid.submit', payload: extraBid }));

    const ack = (await waitForMsg(bidderWs, 'bid.ack')) as {
      payload: { error?: string };
    };
    expect(ack.payload.error).toBe('bid_limit_reached');
  }, 30_000);
});
