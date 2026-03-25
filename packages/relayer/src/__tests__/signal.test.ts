import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import http from 'http';
import { createSignalWebSocketServer } from '../signal';
import type { SignalServerConfig } from '../signal';

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (raw) => {
      resolve(JSON.parse(String(raw)));
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
    } else {
      ws.once('open', () => resolve());
    }
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
    } else {
      ws.once('close', () => resolve());
    }
  });
}

function setupServer(config?: SignalServerConfig) {
  const wss = createSignalWebSocketServer(config);
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  return server;
}

describe('createSignalWebSocketServer', () => {
  let server: http.Server;
  let port: number;
  let clients: WebSocket[];

  beforeEach(async () => {
    clients = [];
    server = setupServer();

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function connect(): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    clients.push(ws);
    return ws;
  }

  it('sends peers list and yourId on connect', async () => {
    const ws = connect();
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe('peers');
    expect(msg.yourId).toBeTruthy();
    expect(Array.isArray(msg.peers)).toBe(true);
  });

  it('announces peer-joined to existing peers', async () => {
    const ws1 = connect();
    const initMsg = await waitForMessage(ws1);
    expect(initMsg.type).toBe('peers');

    // Now connect a second peer — ws1 should receive peer-joined
    const joinPromise = waitForMessage(ws1);
    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);

    const joinMsg = await joinPromise;
    expect(joinMsg.type).toBe('peer-joined');
    expect(joinMsg.peerId).toBe(ws2Init.yourId);
  });

  it('announces peer-left when a peer disconnects', async () => {
    const ws1 = connect();
    await waitForMessage(ws1); // peers msg

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined for ws2

    const leftPromise = waitForMessage(ws1);
    ws2.close();
    const leftMsg = await leftPromise;

    expect(leftMsg.type).toBe('peer-left');
    expect(leftMsg.peerId).toBe(ws2Init.yourId);
  });

  it('routes targeted messages (offer/answer/ice-candidate)', async () => {
    const ws1 = connect();
    const ws1Init = await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    // ws1 sends an offer to ws2
    const offerPromise = waitForMessage(ws2);
    ws1.send(
      JSON.stringify({
        type: 'offer',
        target: ws2Init.yourId,
        data: { sdp: 'mock-sdp', type: 'offer' },
      })
    );

    const offerMsg = await offerPromise;
    expect(offerMsg.type).toBe('offer');
    expect(offerMsg.from).toBe(ws1Init.yourId);
    expect(offerMsg.data).toEqual({ sdp: 'mock-sdp', type: 'offer' });
  });

  it('rejects relay-broadcast messages', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    // ws1 sends relay-broadcast — should be silently dropped
    ws1.send(
      JSON.stringify({
        type: 'relay-broadcast',
        data: '{"id":"test","type":"auction.bids"}',
      })
    );

    const received = await Promise.race([
      waitForMessage(ws2).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });

  it('rejects unknown message types', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    // Send a custom type with valid target — should be dropped
    ws1.send(
      JSON.stringify({
        type: 'custom-foo',
        target: ws2Init.yourId,
        data: { evil: true },
      })
    );

    const received = await Promise.race([
      waitForMessage(ws2).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });

  it('does not route messages without a target', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);
    await waitForMessage(ws1);

    // Send a message with no target — should be silently dropped
    ws1.send(JSON.stringify({ type: 'offer', data: { sdp: 'mock' } }));

    const received = await Promise.race([
      waitForMessage(ws2).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });

  it('includes other peer IDs in initial peers list', async () => {
    const ws1 = connect();
    const ws1Init = await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);

    // ws2 should see ws1 in its peers list
    expect((ws2Init.peers as string[]).length).toBe(1);
    expect(ws2Init.peers).toContain(ws1Init.yourId);
  });

  it('ignores pong messages gracefully', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);
    await waitForOpen(ws1);

    // Should not throw or forward
    ws1.send(JSON.stringify({ type: 'pong' }));

    // Verify the server is still responsive
    const ws2 = connect();
    const msg = await waitForMessage(ws2);
    expect(msg.type).toBe('peers');
  });
});

describe('signal server hardening', () => {
  let server: http.Server;
  let port: number;
  let clients: WebSocket[];

  afterEach(async () => {
    for (const ws of clients) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function connect(): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    clients.push(ws);
    return ws;
  }

  async function startServer(config?: SignalServerConfig) {
    clients = [];
    server = setupServer(config);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;
  }

  it('rejects connections over max limit', async () => {
    await startServer({ maxConnections: 2 });

    const ws1 = connect();
    await waitForMessage(ws1); // peers

    const ws2 = connect();
    await waitForMessage(ws2); // peers

    // 3rd connection should be closed by server
    const ws3 = connect();
    await waitForClose(ws3);

    expect(ws1.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.OPEN);
    expect(ws3.readyState).toBe(WebSocket.CLOSED);
  });

  it('rejects oversized messages', async () => {
    await startServer({ maxMessageSize: 100 });

    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    // Send an offer that exceeds the size limit
    const bigData = 'x'.repeat(200);
    ws1.send(
      JSON.stringify({
        type: 'offer',
        target: ws2Init.yourId,
        data: { sdp: bigData },
      })
    );

    const received = await Promise.race([
      waitForMessage(ws2).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });

  it('rate limits per-peer messages', async () => {
    await startServer({ rateLimitPerSec: 2 });

    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined
    await waitForOpen(ws1);

    const received: Record<string, unknown>[] = [];
    ws2.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'offer') received.push(msg);
    });

    // Send 3 rapid offers — only 2 should arrive
    for (let i = 0; i < 3; i++) {
      ws1.send(
        JSON.stringify({
          type: 'offer',
          target: ws2Init.yourId,
          data: { sdp: `offer-${i}` },
        })
      );
    }

    // Wait for all messages to settle
    await new Promise((r) => setTimeout(r, 200));
    expect(received.length).toBe(2);
  });

  it('rejects connections exceeding per-IP limit', async () => {
    await startServer({ maxConnectionsPerIp: 2 });

    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);

    // 3rd connection from same IP should be closed
    const ws3 = connect();
    await waitForClose(ws3);

    expect(ws1.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.OPEN);
    expect(ws3.readyState).toBe(WebSocket.CLOSED);
  });

  it('allows reconnection after a per-IP slot frees up', async () => {
    await startServer({ maxConnectionsPerIp: 1 });

    const ws1 = connect();
    await waitForMessage(ws1);

    // 2nd connection rejected
    const ws2 = connect();
    await waitForClose(ws2);
    expect(ws2.readyState).toBe(WebSocket.CLOSED);

    // Close the first — slot opens
    ws1.close();
    await waitForClose(ws1);

    // Now a new connection should succeed
    const ws3 = connect();
    const msg = await waitForMessage(ws3);
    expect(msg.type).toBe('peers');
    expect(ws3.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects connections exceeding per-IP rate limit', async () => {
    await startServer({ connectionRateLimitPerMin: 2 });

    // First two connections succeed
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);

    // Close them to free per-IP connection slots
    ws1.close();
    await waitForClose(ws1);
    ws2.close();
    await waitForClose(ws2);

    // 3rd connection within the same minute should be rate-limited
    const ws3 = connect();
    await waitForClose(ws3);
    expect(ws3.readyState).toBe(WebSocket.CLOSED);
  });

  it('uses rightmost X-Forwarded-For IP (ignores client-spoofed prefix)', async () => {
    await startServer({ maxConnectionsPerIp: 1 });

    // Connect with a spoofed X-Forwarded-For — the proxy appends the real IP
    // so the header looks like "spoofed, real-ip". Server should use "real-ip".
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    });
    clients.push(ws1);
    await waitForMessage(ws1);

    // Second connection from "different spoofed IP" but same real IP (10.0.0.1)
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' },
    });
    clients.push(ws2);

    // Should be rejected — same real IP (10.0.0.1), limit is 1
    await waitForClose(ws2);
    expect(ws1.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.CLOSED);
  });

  it('closes idle connections after timeout', async () => {
    await startServer({ idleTimeoutMs: 200 });

    const ws1 = connect();
    await waitForMessage(ws1);
    expect(ws1.readyState).toBe(WebSocket.OPEN);

    // Wait for idle timeout to fire
    await waitForClose(ws1);
    expect(ws1.readyState).toBe(WebSocket.CLOSED);
  });

  it('resets idle timeout on message activity', async () => {
    await startServer({ idleTimeoutMs: 300 });

    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    // Send a message at 150ms — should reset the timer
    await new Promise((r) => setTimeout(r, 150));
    ws1.send(
      JSON.stringify({
        type: 'offer',
        target: ws2Init.yourId as string,
        data: { sdp: 'keepalive' },
      })
    );

    // At 350ms total, the original timer would have fired, but the reset pushed it out
    await new Promise((r) => setTimeout(r, 200));
    expect(ws1.readyState).toBe(WebSocket.OPEN);

    // Now wait for the actual timeout
    await waitForClose(ws1);
    expect(ws1.readyState).toBe(WebSocket.CLOSED);
  });
});
