import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// Use vi.hoisted so mock fns are available before vi.mock factories run
const { mockReadContract, mockVerifyMessage } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockVerifyMessage: vi.fn(),
}));

// Mock getProviderForChain to return a controllable mock client
vi.mock('../utils/getProviderForChain', () => ({
  getProviderForChain: vi.fn(() => ({
    readContract: mockReadContract,
  })),
}));

// Mock viem's verifyMessage to control signature verification
vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    verifyMessage: mockVerifyMessage,
  };
});

// Mock Sentry to avoid side effects
vi.mock('../instrument', () => ({
  default: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));

import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';

let httpServer: Server;
let wss: ReturnType<typeof createAuctionWebSocketServer>;
let serverPort: number;

const openClients: WebSocket[] = [];

function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}/auction`);
    ws.on('open', () => {
      openClients.push(ws);
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

function waitForMessage(
  ws: WebSocket,
  expectedType: string,
  timeout = 5000
): Promise<unknown> {
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

function sendAndWait(
  ws: WebSocket,
  message: unknown,
  expectedResponseType: string,
  timeout = 5000
): Promise<unknown> {
  const responsePromise = waitForMessage(ws, expectedResponseType, timeout);
  ws.send(JSON.stringify(message));
  return responsePromise;
}

// Collect all messages of a given type within a time window
function collectMessages(
  ws: WebSocket,
  expectedType: string,
  duration: number
): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === expectedType) {
        messages.push(msg);
      }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.off('message', handler);
      resolve(messages);
    }, duration);
  });
}

const AUTHORIZED_SIGNER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const VAULT_ADDRESS = '0x1234567890123456789012345678901234567890';
const CHAIN_ID = 5064014;

function makeValidPublishPayload(overrides?: Record<string, unknown>) {
  return {
    chainId: CHAIN_ID,
    vaultAddress: VAULT_ADDRESS,
    vaultCollateralPerShare: '1.234567',
    timestamp: Date.now(),
    signedBy: AUTHORIZED_SIGNER,
    signature: '0xdeadbeef',
    ...overrides,
  };
}

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
  vi.clearAllMocks();
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

describe('vault_quote.subscribe', () => {
  it('returns ack with ok:true for valid subscribe', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean; error?: string } };

    expect(response.type).toBe('vault_quote.ack');
    expect(response.payload.ok).toBe(true);
  });

  it('returns error:invalid_subscribe when missing chainId', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.subscribe',
        payload: { vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean; error?: string } };

    expect(response.payload.error).toBe('invalid_subscribe');
  });

  it('returns error:invalid_subscribe when missing vaultAddress', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID },
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean; error?: string } };

    expect(response.payload.error).toBe('invalid_subscribe');
  });

  it('notifies observers with vault_quote.requested on new subscription', async () => {
    const observer = await createClient();
    const subscriber = await createClient();

    // Register as observer
    await sendAndWait(
      observer,
      { type: 'vault_quote.observe' },
      'vault_quote.ack'
    );

    // Set up listener for vault_quote.requested
    const requestedPromise = waitForMessage(observer, 'vault_quote.requested');

    // Subscribe from another client
    subscriber.send(
      JSON.stringify({
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      })
    );

    const requested = (await requestedPromise) as {
      type: string;
      payload: { chainId: number; vaultAddress: string; channel: string };
    };
    expect(requested.type).toBe('vault_quote.requested');
    expect(requested.payload.chainId).toBe(CHAIN_ID);
    expect(requested.payload.vaultAddress).toBe(VAULT_ADDRESS.toLowerCase());
  });
});

describe('vault_quote.unsubscribe', () => {
  it('returns ack with ok:true for valid unsubscribe', async () => {
    const ws = await createClient();

    // Subscribe first
    await sendAndWait(
      ws,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    );

    // Unsubscribe
    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.unsubscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean } };

    expect(response.payload.ok).toBe(true);
  });

  it('silently handles unsubscribe when not subscribed', async () => {
    const ws = await createClient();

    // Unsubscribe without subscribing first — should still get ack
    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.unsubscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean } };

    expect(response.payload.ok).toBe(true);
  });
});

describe('vault_quote.publish', () => {
  beforeAll(() => {
    // Default: readContract returns the authorized signer (manager)
    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    // Default: signature verification passes
    mockVerifyMessage.mockResolvedValue(true);
  });

  it('broadcasts vault_quote.update to subscribers on valid publish', async () => {
    const subscriber = await createClient();
    const publisher = await createClient();

    // Subscribe
    await sendAndWait(
      subscriber,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    );

    // Listen for update on subscriber
    const updatePromise = waitForMessage(subscriber, 'vault_quote.update');

    // Publish
    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);
    publisher.send(
      JSON.stringify({
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload(),
      })
    );

    const update = (await updatePromise) as {
      type: string;
      payload: {
        chainId: number;
        vaultAddress: string;
        vaultCollateralPerShare: string;
      };
    };
    expect(update.type).toBe('vault_quote.update');
    expect(update.payload.vaultCollateralPerShare).toBe('1.234567');
    expect(update.payload.vaultAddress).toBe(VAULT_ADDRESS.toLowerCase());
  });

  it('returns error:invalid_payload for missing fields', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.publish',
        payload: { chainId: CHAIN_ID }, // Missing most fields
      },
      'vault_quote.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('invalid_payload');
  });

  it('returns error:stale_timestamp for timestamps >5min old', async () => {
    const ws = await createClient();

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({
          timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        }),
      },
      'vault_quote.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('stale_timestamp');
  });

  it('returns error:bad_signature when signature verification fails', async () => {
    const ws = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(false);

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload(),
      },
      'vault_quote.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('bad_signature');
  });

  it('returns error:unauthorized_signer when signer is not vault manager', async () => {
    const ws = await createClient();

    // Return a different address as the vault manager
    mockReadContract.mockResolvedValue(
      '0x9999999999999999999999999999999999999999'
    );
    mockVerifyMessage.mockResolvedValue(true);

    // Use a unique vault address so we don't hit a cached signer set from previous tests
    const uniqueVault = '0xUNAUTH0000000000000000000000000000000001';

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({ vaultAddress: uniqueVault }),
      },
      'vault_quote.ack'
    )) as { type: string; payload: { error?: string } };

    expect(response.payload.error).toBe('unauthorized_signer');
  });

  it('normalizes vaultAddress to lowercase in broadcast', async () => {
    const subscriber = await createClient();
    const publisher = await createClient();

    // Subscribe with mixed case
    await sendAndWait(
      subscriber,
      {
        type: 'vault_quote.subscribe',
        payload: {
          chainId: CHAIN_ID,
          vaultAddress: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333',
        },
      },
      'vault_quote.ack'
    );

    const updatePromise = waitForMessage(subscriber, 'vault_quote.update');

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    publisher.send(
      JSON.stringify({
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({
          vaultAddress: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333',
        }),
      })
    );

    const update = (await updatePromise) as {
      type: string;
      payload: { vaultAddress: string };
    };
    expect(update.payload.vaultAddress).toBe(
      '0xaaaabbbbccccddddeeeeFFFF0000111122223333'.toLowerCase()
    );
  });

  it('vault_quote.submit works as alias for vault_quote.publish', async () => {
    const ws = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    const response = (await sendAndWait(
      ws,
      {
        type: 'vault_quote.submit',
        payload: makeValidPublishPayload(),
      },
      'vault_quote.ack'
    )) as { type: string; payload: { ok?: boolean } };

    expect(response.payload.ok).toBe(true);
  });

  it('caches quote for future subscribers', async () => {
    const publisher = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    // Use a unique vault for this test
    const uniqueVault = '0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE';

    // Publish first
    await sendAndWait(
      publisher,
      {
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({ vaultAddress: uniqueVault }),
      },
      'vault_quote.ack'
    );

    // Now subscribe — should receive the cached quote immediately
    const lateSubscriber = await createClient();
    const updatePromise = waitForMessage(lateSubscriber, 'vault_quote.update');

    lateSubscriber.send(
      JSON.stringify({
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: uniqueVault },
      })
    );

    const update = (await updatePromise) as {
      type: string;
      payload: { vaultAddress: string };
    };
    expect(update.type).toBe('vault_quote.update');
    expect(update.payload.vaultAddress).toBe(uniqueVault.toLowerCase());
  });
});

describe('vault_quote.observe / unobserve', () => {
  it('observer receives vault_quote.update when quotes are published', async () => {
    const observer = await createClient();
    const publisher = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    // Register as observer
    await sendAndWait(
      observer,
      { type: 'vault_quote.observe' },
      'vault_quote.ack'
    );

    const updatePromise = waitForMessage(observer, 'vault_quote.update');

    // Publish a quote
    publisher.send(
      JSON.stringify({
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload(),
      })
    );

    const update = (await updatePromise) as {
      type: string;
      payload: { vaultCollateralPerShare: string };
    };
    expect(update.type).toBe('vault_quote.update');
    expect(update.payload.vaultCollateralPerShare).toBe('1.234567');
  });

  it('observer receives vault_quote.requested on new subscriptions', async () => {
    const observer = await createClient();
    const subscriber = await createClient();

    // Register as observer
    await sendAndWait(
      observer,
      { type: 'vault_quote.observe' },
      'vault_quote.ack'
    );

    const requestedPromise = waitForMessage(observer, 'vault_quote.requested');

    // Another client subscribes
    subscriber.send(
      JSON.stringify({
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      })
    );

    const requested = (await requestedPromise) as {
      type: string;
      payload: { chainId: number; vaultAddress: string };
    };
    expect(requested.type).toBe('vault_quote.requested');
    expect(requested.payload.chainId).toBe(CHAIN_ID);
  });

  it('unobserve stops delivery of updates', async () => {
    const observer = await createClient();
    const publisher = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    // Register as observer
    await sendAndWait(
      observer,
      { type: 'vault_quote.observe' },
      'vault_quote.ack'
    );

    // Unobserve
    await sendAndWait(
      observer,
      { type: 'vault_quote.unobserve' },
      'vault_quote.ack'
    );

    // Publish a quote — observer should NOT receive it
    const collected = collectMessages(observer, 'vault_quote.update', 300);

    publisher.send(
      JSON.stringify({
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({
          vaultAddress: '0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD',
        }),
      })
    );

    const messages = await collected;
    expect(messages).toHaveLength(0);
  });
});

describe('Cleanup on disconnect', () => {
  it('vault subscriptions removed on client disconnect', async () => {
    const subscriber = await createClient();
    const publisher = await createClient();
    const otherSubscriber = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    const uniqueVault = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';

    // Both clients subscribe
    await sendAndWait(
      subscriber,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: uniqueVault },
      },
      'vault_quote.ack'
    );
    await sendAndWait(
      otherSubscriber,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: uniqueVault },
      },
      'vault_quote.ack'
    );

    // Disconnect the first subscriber
    const closePromise = new Promise<void>((resolve) =>
      subscriber.on('close', () => resolve())
    );
    subscriber.close();
    await closePromise;

    // Give server time to process close
    await new Promise((r) => setTimeout(r, 50));

    // Publish — otherSubscriber should still get the update
    const updatePromise = waitForMessage(otherSubscriber, 'vault_quote.update');

    publisher.send(
      JSON.stringify({
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload({ vaultAddress: uniqueVault }),
      })
    );

    const update = (await updatePromise) as { type: string };
    expect(update.type).toBe('vault_quote.update');
  });

  it('observer status removed on client disconnect', async () => {
    const observer = await createClient();
    const publisher = await createClient();
    const subscriber = await createClient();

    mockReadContract.mockResolvedValue(AUTHORIZED_SIGNER);
    mockVerifyMessage.mockResolvedValue(true);

    // Register as observer
    await sendAndWait(
      observer,
      { type: 'vault_quote.observe' },
      'vault_quote.ack'
    );

    // Disconnect observer
    const closePromise = new Promise<void>((resolve) =>
      observer.on('close', () => resolve())
    );
    observer.close();
    await closePromise;
    await new Promise((r) => setTimeout(r, 50));

    // Subscribe from another client — observer should NOT get vault_quote.requested
    // (because it's disconnected). This just verifies no error thrown.
    await sendAndWait(
      subscriber,
      {
        type: 'vault_quote.subscribe',
        payload: { chainId: CHAIN_ID, vaultAddress: VAULT_ADDRESS },
      },
      'vault_quote.ack'
    );

    // Publish — should succeed without errors even though observer is gone
    const ack = (await sendAndWait(
      publisher,
      {
        type: 'vault_quote.publish',
        payload: makeValidPublishPayload(),
      },
      'vault_quote.ack'
    )) as { payload: { ok?: boolean } };

    expect(ack.payload.ok).toBe(true);
  });
});
