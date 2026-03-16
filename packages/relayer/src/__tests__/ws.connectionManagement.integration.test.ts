import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// Mock config with small values for testability
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: '0',
    ENABLE_AUCTION_WS: true,
    SENTRY_DSN: '',
    RATE_LIMIT_WINDOW_MS: 500,
    RATE_LIMIT_MAX_MESSAGES: 5,
    WS_IDLE_TIMEOUT_MS: 2000,
    WS_MAX_CONNECTIONS: 3,
    WS_ALLOWED_ORIGINS: '',
  },
  isProd: false,
  isDev: false,
}));

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

// Track clients for cleanup
const openClients: WebSocket[] = [];

function createClient(options?: { origin?: string }): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (options?.origin) {
      headers['origin'] = options.origin;
    }
    const ws = new WebSocket(`ws://localhost:${serverPort}/auction`, {
      headers,
    });
    ws.on('open', () => {
      openClients.push(ws);
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

function waitForClose(
  ws: WebSocket,
  timeout = 3000
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

function waitForMessage(
  ws: WebSocket,
  expectedType: string,
  timeout = 3000
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
  // Close all tracked clients
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
  for (const client of wss.clients) {
    client.close();
  }
  await new Promise<void>((resolve) => {
    wss.close(() => {
      httpServer.close(() => resolve());
    });
  });
});

describe('Rate Limiting', () => {
  it('allows messages up to the limit', async () => {
    const ws = await createClient();

    // Send 5 messages (the limit) — each should succeed
    for (let i = 0; i < 5; i++) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }

    // The last ping should still get a pong
    const response = (await waitForMessage(ws, 'pong')) as { type: string };
    expect(response.type).toBe('pong');
  });

  it('closes with code 1008 "rate_limited" when limit exceeded', async () => {
    const ws = await createClient();
    const closePromise = waitForClose(ws);

    // Send more than 5 messages rapidly
    for (let i = 0; i < 7; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('rate_limited');
  });

  it('resets after window elapses', async () => {
    const ws = await createClient();

    // Send 4 messages (under limit)
    for (let i = 0; i < 4; i++) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
    // Wait for last pong
    await waitForMessage(ws, 'pong');

    // Wait for the rate limit window to reset (500ms config + margin)
    await new Promise((r) => setTimeout(r, 600));

    // Should be able to send again after rate window reset
    ws.send(JSON.stringify({ type: 'ping' }));
    const response = (await waitForMessage(ws, 'pong')) as { type: string };
    expect(response.type).toBe('pong');
  });
});

describe('Message Size', () => {
  it('closes with code 1009 "message_too_large" for messages >64KB', async () => {
    const ws = await createClient();
    const closePromise = waitForClose(ws);

    // Send a message larger than 64,000 bytes
    const largePayload = 'x'.repeat(65_000);
    ws.send(JSON.stringify({ type: 'ping', data: largePayload }));

    const { code, reason } = await closePromise;
    expect(code).toBe(1009);
    expect(reason).toBe('message_too_large');
  });
});

describe('Idle Timeout', () => {
  it('closes with code 1008 "idle_timeout" after configured period', async () => {
    const ws = await createClient();
    const closePromise = waitForClose(ws, 5000);

    // Do nothing — wait for idle timeout (2000ms config + margin)
    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('idle_timeout');
  });

  it('resets on message activity', async () => {
    const ws = await createClient();

    // Send a message at ~1000ms to reset the 2000ms idle timer
    await new Promise((r) => setTimeout(r, 1000));
    ws.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(ws, 'pong');

    // Send again at ~1000ms after last message
    await new Promise((r) => setTimeout(r, 1000));
    ws.send(JSON.stringify({ type: 'ping' }));
    const response = (await waitForMessage(ws, 'pong')) as { type: string };
    expect(response.type).toBe('pong');

    // The connection should still be open (not idle-timed-out at the original 2000ms mark)
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('resets on ping frames', async () => {
    const ws = await createClient();

    // Send WebSocket-level ping at ~1000ms
    await new Promise((r) => setTimeout(r, 1000));
    ws.ping();

    // Send another ping at ~1000ms later
    await new Promise((r) => setTimeout(r, 1000));
    ws.ping();

    // Connection should still be open
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });
});

describe('Connection Limit', () => {
  // Fresh server per test — guarantees activeConnectionCount starts at 0.
  // Using beforeAll/afterEach caused stale counts because ws.close() is async
  // and the server may not have decremented before the next test starts.
  let limitHttpServer: Server;
  let limitWss: ReturnType<typeof createAuctionWebSocketServer>;
  let limitPort: number;
  const limitClients: WebSocket[] = [];

  beforeEach(async () => {
    const configModule = await import('../config');
    (configModule.config as Record<string, unknown>).WS_IDLE_TIMEOUT_MS =
      600000;

    limitHttpServer = createServer();
    limitWss = createAuctionWebSocketServer();

    limitHttpServer.on('upgrade', (request, socket, head) => {
      limitWss.handleUpgrade(request, socket, head, (ws) => {
        limitWss.emit('connection', ws, request);
      });
    });

    await new Promise<void>((resolve) => {
      limitHttpServer.listen(0, () => {
        const addr = limitHttpServer.address();
        limitPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of limitClients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    limitClients.length = 0;

    for (const client of limitWss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      limitWss.close(() => {
        limitHttpServer.close(() => resolve());
      });
    });
  });

  afterAll(async () => {
    const configModule = await import('../config');
    (configModule.config as Record<string, unknown>).WS_IDLE_TIMEOUT_MS = 2000;
  });

  function connectToLimitServer(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${limitPort}/auction`);
      ws.on('open', () => {
        limitClients.push(ws);
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('accepts up to WS_MAX_CONNECTIONS', async () => {
    const clients: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const ws = await connectToLimitServer();
      clients.push(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }
  });

  it('rejects with code 1008 "connection_limit_exceeded" beyond limit', async () => {
    // Fill up to max (3)
    for (let i = 0; i < 3; i++) {
      await connectToLimitServer();
    }

    // 4th connection should be rejected
    const ws4 = new WebSocket(`ws://localhost:${limitPort}/auction`);
    limitClients.push(ws4);
    const closePromise = waitForClose(ws4);

    const { code, reason } = await closePromise;
    expect(code).toBe(1008);
    expect(reason).toBe('connection_limit_exceeded');
  });

  it('allows new connections after disconnect', async () => {
    // Fill up to max (3)
    const clients: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      clients.push(await connectToLimitServer());
    }

    // Close one connection and wait for server to process it
    const closedClient = clients[0];
    const closePromise = new Promise<void>((resolve) => {
      closedClient.on('close', () => resolve());
    });
    closedClient.close();
    await closePromise;

    // Give the server a moment to process the close
    await new Promise((r) => setTimeout(r, 50));

    // New connection should succeed
    const newClient = await connectToLimitServer();
    expect(newClient.readyState).toBe(WebSocket.OPEN);
  });
});

describe('Origin Validation', () => {
  // For origin tests, we need to re-create the server with WS_ALLOWED_ORIGINS set.
  // We use a separate server/wss pair for these tests.
  let originHttpServer: Server;
  let originWss: ReturnType<typeof createAuctionWebSocketServer>;
  let originPort: number;

  // Dynamically re-mock config for origin tests
  beforeAll(async () => {
    // Import the mocked config and override WS_ALLOWED_ORIGINS
    const configModule = await import('../config');
    (configModule.config as Record<string, unknown>).WS_ALLOWED_ORIGINS =
      'http://allowed.example.com,http://also-allowed.com';

    originHttpServer = createServer();
    originWss = createAuctionWebSocketServer();

    originHttpServer.on('upgrade', (request, socket, head) => {
      originWss.handleUpgrade(request, socket, head, (ws) => {
        originWss.emit('connection', ws, request);
      });
    });

    await new Promise<void>((resolve) => {
      originHttpServer.listen(0, () => {
        const addr = originHttpServer.address();
        originPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Restore config
    const configModule = await import('../config');
    (configModule.config as Record<string, unknown>).WS_ALLOWED_ORIGINS = '';

    for (const client of originWss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      originWss.close(() => {
        originHttpServer.close(() => resolve());
      });
    });
  });

  it('allows matching origin', async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const client = new WebSocket(`ws://localhost:${originPort}/auction`, {
        headers: { origin: 'http://allowed.example.com' },
      });
      client.on('open', () => resolve(client));
      client.on('error', reject);
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects non-matching origin with code 1008 "origin_not_allowed"', async () => {
    const ws = new WebSocket(`ws://localhost:${originPort}/auction`, {
      headers: { origin: 'http://evil.example.com' },
    });

    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(1008);
    expect(reason).toBe('origin_not_allowed');
  });

  it('rejects connections with no origin header when origins are configured', async () => {
    const ws = new WebSocket(`ws://localhost:${originPort}/auction`);

    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(1008);
    expect(reason).toBe('origin_not_allowed');
  });
});
