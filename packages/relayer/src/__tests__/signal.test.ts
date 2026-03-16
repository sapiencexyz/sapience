import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import http from 'http';
import { createSignalWebSocketServer } from '../signal';

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

describe('createSignalWebSocketServer', () => {
  let server: http.Server;
  let port: number;
  let clients: WebSocket[];

  beforeEach(async () => {
    clients = [];
    const wss = createSignalWebSocketServer();

    server = http.createServer();
    server.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

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

  it('broadcasts relay-broadcast to all other peers', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);
    await waitForMessage(ws1); // peer-joined

    const ws3 = connect();
    await waitForMessage(ws3);
    await waitForMessage(ws1); // peer-joined for ws3
    await waitForMessage(ws2); // peer-joined for ws3

    // ws1 sends relay-broadcast
    const relay2 = waitForMessage(ws2);
    const relay3 = waitForMessage(ws3);

    ws1.send(
      JSON.stringify({
        type: 'relay-broadcast',
        data: '{"id":"test","type":"auction.bids"}',
      })
    );

    const msg2 = await relay2;
    const msg3 = await relay3;

    expect(msg2.type).toBe('relay-broadcast');
    expect(msg2.data).toBe('{"id":"test","type":"auction.bids"}');

    expect(msg3.type).toBe('relay-broadcast');
    expect(msg3.data).toBe('{"id":"test","type":"auction.bids"}');
  });

  it('does not route messages without a target (non-relay)', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    await waitForMessage(ws2);
    await waitForMessage(ws1);

    // Send a message with no target — should be silently dropped
    ws1.send(JSON.stringify({ type: 'offer', data: { sdp: 'mock' } }));

    // Give it a moment — ws2 should not receive anything
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
