/**
 * Integration test: signal server peer discovery and signaling flow.
 *
 * Verifies the full contract that mesh clients depend on:
 * 1. Clients connect and receive peer lists with their assigned ID
 * 2. New peers are announced via peer-joined to existing clients
 * 3. Clients can exchange offer/answer/ice-candidate through the server
 * 4. Departing peers are announced via peer-left
 * 5. Peer discovery works across multiple clients (3-node mesh setup)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import http from 'http';
import { createSignalWebSocketServer } from '../signal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SignalMessage {
  type: string;
  peers?: string[];
  yourId?: string;
  peerId?: string;
  from?: string;
  target?: string;
  data?: unknown;
}

function setupServer() {
  const wss = createSignalWebSocketServer({
    maxConnections: 50,
    idleTimeoutMs: 30_000,
  });
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  return server;
}

function waitForMessage(
  ws: WebSocket,
  filter?: (msg: SignalMessage) => boolean
): Promise<SignalMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('waitForMessage timed out')),
      3000
    );
    const handler = (raw: Buffer | string) => {
      const msg = JSON.parse(String(raw)) as SignalMessage;
      if (!filter || filter(msg)) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once('open', () => resolve());
  });
}

function _waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', () => resolve());
  });
}

function noMessage(ws: WebSocket, ms = 200): Promise<boolean> {
  return Promise.race([
    waitForMessage(ws).then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('signal server peer discovery flow', () => {
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
    const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    clients.push(ws);
    return ws;
  }

  it('assigns unique IDs and returns peer list on connect', async () => {
    const ws1 = connect();
    const msg1 = await waitForMessage(ws1);

    expect(msg1.type).toBe('peers');
    expect(msg1.yourId).toBeTruthy();
    expect(msg1.peers).toEqual([]); // First client, no peers yet

    const ws2 = connect();
    const msg2 = await waitForMessage(ws2);

    expect(msg2.type).toBe('peers');
    expect(msg2.yourId).toBeTruthy();
    expect(msg2.yourId).not.toBe(msg1.yourId);
    expect(msg2.peers).toContain(msg1.yourId); // Should see ws1
  });

  it('announces peer-joined to existing clients when a new peer connects', async () => {
    const ws1 = connect();
    await waitForMessage(ws1); // peers msg

    const joinPromise = waitForMessage(ws1, (m) => m.type === 'peer-joined');
    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);

    const joinMsg = await joinPromise;
    expect(joinMsg.type).toBe('peer-joined');
    expect(joinMsg.peerId).toBe(ws2Init.yourId);
  });

  it('announces peer-left when a client disconnects', async () => {
    const ws1 = connect();
    await waitForMessage(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1, (m) => m.type === 'peer-joined');

    const leftPromise = waitForMessage(ws1, (m) => m.type === 'peer-left');
    ws2.close();
    const leftMsg = await leftPromise;

    expect(leftMsg.peerId).toBe(ws2Init.yourId);
  });

  it('routes offer from A to B and answer from B to A', async () => {
    const ws1 = connect();
    const ws1Init = await waitForMessage(ws1);
    await waitForOpen(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1, (m) => m.type === 'peer-joined');
    await waitForOpen(ws2);

    // A sends offer to B
    const offerPromise = waitForMessage(ws2, (m) => m.type === 'offer');
    ws1.send(
      JSON.stringify({
        type: 'offer',
        target: ws2Init.yourId,
        data: { sdp: 'mock-offer', type: 'offer' },
      })
    );

    const offerMsg = await offerPromise;
    expect(offerMsg.from).toBe(ws1Init.yourId);
    expect(offerMsg.data).toEqual({ sdp: 'mock-offer', type: 'offer' });

    // B sends answer back to A
    const answerPromise = waitForMessage(ws1, (m) => m.type === 'answer');
    ws2.send(
      JSON.stringify({
        type: 'answer',
        target: ws1Init.yourId,
        data: { sdp: 'mock-answer', type: 'answer' },
      })
    );

    const answerMsg = await answerPromise;
    expect(answerMsg.from).toBe(ws2Init.yourId);
    expect(answerMsg.data).toEqual({ sdp: 'mock-answer', type: 'answer' });
  });

  it('routes ice-candidate messages bidirectionally', async () => {
    const ws1 = connect();
    const ws1Init = await waitForMessage(ws1);
    await waitForOpen(ws1);

    const ws2 = connect();
    const ws2Init = await waitForMessage(ws2);
    await waitForMessage(ws1, (m) => m.type === 'peer-joined');
    await waitForOpen(ws2);

    // A sends ICE candidate to B
    const icePromise = waitForMessage(ws2, (m) => m.type === 'ice-candidate');
    ws1.send(
      JSON.stringify({
        type: 'ice-candidate',
        target: ws2Init.yourId,
        data: { candidate: 'candidate:1 ...', sdpMid: '0' },
      })
    );

    const iceMsg = await icePromise;
    expect(iceMsg.from).toBe(ws1Init.yourId);
    expect(iceMsg.data).toEqual({
      candidate: 'candidate:1 ...',
      sdpMid: '0',
    });
  });

  it('three-client discovery: all clients learn about each other', async () => {
    // Client A connects
    const wsA = connect();
    const initA = await waitForMessage(wsA);
    expect(initA.peers).toHaveLength(0);

    // Client B connects — learns about A, A learns about B
    const wsB = connect();
    const initB = await waitForMessage(wsB);
    const joinB = await waitForMessage(wsA, (m) => m.type === 'peer-joined');

    expect(initB.peers).toContain(initA.yourId);
    expect(joinB.peerId).toBe(initB.yourId);

    // Client C connects — learns about A and B
    const wsC = connect();
    const initC = await waitForMessage(wsC);

    expect(initC.peers).toContain(initA.yourId);
    expect(initC.peers).toContain(initB.yourId);

    // A and B both receive peer-joined for C
    const joinCA = await waitForMessage(wsA, (m) => m.type === 'peer-joined');
    const joinCB = await waitForMessage(wsB, (m) => m.type === 'peer-joined');

    expect(joinCA.peerId).toBe(initC.yourId);
    expect(joinCB.peerId).toBe(initC.yourId);
  });

  it('three-client signaling: A↔B and B↔C can exchange offers simultaneously', async () => {
    const wsA = connect();
    const initA = await waitForMessage(wsA);
    await waitForOpen(wsA);

    const wsB = connect();
    const initB = await waitForMessage(wsB);
    await waitForMessage(wsA, (m) => m.type === 'peer-joined');
    await waitForOpen(wsB);

    const wsC = connect();
    const initC = await waitForMessage(wsC);
    await waitForMessage(wsA, (m) => m.type === 'peer-joined');
    await waitForMessage(wsB, (m) => m.type === 'peer-joined');
    await waitForOpen(wsC);

    // A sends offer to B
    const offerAB = waitForMessage(wsB, (m) => m.type === 'offer');
    wsA.send(
      JSON.stringify({
        type: 'offer',
        target: initB.yourId,
        data: { sdp: 'A→B' },
      })
    );

    // B sends offer to C
    const offerBC = waitForMessage(wsC, (m) => m.type === 'offer');
    wsB.send(
      JSON.stringify({
        type: 'offer',
        target: initC.yourId,
        data: { sdp: 'B→C' },
      })
    );

    const [msgAB, msgBC] = await Promise.all([offerAB, offerBC]);

    expect(msgAB.from).toBe(initA.yourId);
    expect((msgAB.data as { sdp: string }).sdp).toBe('A→B');

    expect(msgBC.from).toBe(initB.yourId);
    expect((msgBC.data as { sdp: string }).sdp).toBe('B→C');
  });

  it('does not leak messages to unrelated peers', async () => {
    const wsA = connect();
    const initA = await waitForMessage(wsA);
    await waitForOpen(wsA);

    const wsB = connect();
    const initB = await waitForMessage(wsB);
    await waitForOpen(wsB);

    const wsC = connect();
    await waitForMessage(wsC);
    await waitForMessage(wsA, (m) => m.type === 'peer-joined'); // C joined
    await waitForMessage(wsB, (m) => m.type === 'peer-joined'); // C joined
    await waitForOpen(wsC);

    // A sends offer targeted at B — C should NOT receive it
    wsA.send(
      JSON.stringify({
        type: 'offer',
        target: initB.yourId,
        data: { sdp: 'private-to-B' },
      })
    );

    // B should get it
    const msgB = await waitForMessage(wsB, (m) => m.type === 'offer');
    expect(msgB.from).toBe(initA.yourId);

    // C should get nothing
    const leaked = await noMessage(wsC);
    expect(leaked).toBe(false);
  });
});
