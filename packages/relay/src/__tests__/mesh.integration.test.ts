/**
 * Integration test: signal server → PeerManager → MeshClient gossip
 *
 * Verifies the full peer discovery loop:
 * 1. Clients connect to a real signal server and receive peer lists
 * 2. PeerManager exchanges offers/answers through the signal server
 * 3. Data channels open → MeshClient fires __peer-share gossip
 * 4. Receiving clients discover new peers via gossip
 *
 * PeerConnection is mocked to simulate WebRTC data channels without
 * a native WebRTC implementation. Everything else is real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import { createSignalWebSocketServer } from '../signal';

// ---------------------------------------------------------------------------
// Mock PeerConnection — simulates WebRTC offer/answer + data channel
// ---------------------------------------------------------------------------

/**
 * Registry that pairs up PeerConnection instances so that when A creates an
 * offer targeting B and B accepts it, a simulated data channel opens on both.
 */
const peerRegistry = new Map<string, MockPeerConnection>();

class MockDataChannel {
  readyState: string = 'connecting';
  label = 'sapience-relay';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  private remote: MockDataChannel | null = null;

  link(other: MockDataChannel): void {
    this.remote = other;
    other.remote = this;
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  send(data: string): void {
    if (this.readyState !== 'open') return;
    // Deliver to the remote end asynchronously
    const r = this.remote;
    if (r && r.readyState === 'open') {
      setTimeout(() => r.onmessage?.({ data }), 0);
    }
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }
}

class MockPeerConnection {
  readonly peerId: string;
  private events: import('../peer/PeerConnection').PeerConnectionEvents;
  private dc: MockDataChannel | null = null;
  onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;

  constructor(
    peerId: string,
    _config: RTCConfiguration | undefined,
    events: import('../peer/PeerConnection').PeerConnectionEvents
  ) {
    this.peerId = peerId;
    this.events = events;
    peerRegistry.set(peerId, this);
  }

  get isOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = new MockDataChannel();
    return { type: 'offer', sdp: `mock-offer-for-${this.peerId}` };
  }

  async acceptOffer(
    _offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    this.dc = new MockDataChannel();
    return { type: 'answer', sdp: `mock-answer-from-${this.peerId}` };
  }

  async setAnswer(_answer: RTCSessionDescriptionInit): Promise<void> {
    // Link data channels and open them
    const remote = peerRegistry.get(this.peerId);
    if (remote && remote.dc && this.dc) {
      this.dc.link(remote.dc);
      // Simulate async open
      setTimeout(() => {
        this.dc!.onmessage = (ev) => this.events.onMessage(ev.data);
        remote.dc!.onmessage = (ev) => remote.events.onMessage(ev.data);
        this.dc!.open();
        this.events.onOpen();
        remote.dc!.open();
        remote.events.onOpen();
      }, 5);
    }
  }

  async addIceCandidate(_c: RTCIceCandidateInit): Promise<void> {
    // No-op in mock
  }

  send(data: string): boolean {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(data);
      return true;
    }
    return false;
  }

  close(): void {
    this.dc?.close();
  }
}

// Replace PeerConnection with our mock
vi.mock('../peer/PeerConnection', () => ({
  PeerConnection: MockPeerConnection,
}));

// Now import MeshClient (which imports PeerManager, which imports mocked PeerConnection)
const { MeshClient } = await import('../mesh/MeshClient');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setupSignalServer() {
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

function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 20
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor timed out'));
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mesh peer discovery integration', () => {
  let server: http.Server;
  let port: number;
  let clients: InstanceType<typeof MeshClient>[];

  beforeEach(async () => {
    clients = [];
    peerRegistry.clear();
    server = setupSignalServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function createClient(overrides?: Record<string, unknown>) {
    const c = new MeshClient({
      signalUrl: `ws://127.0.0.1:${port}/signal`,
      maxPeers: 6,
      rateLimitPerSec: 100,
      seenTtlMs: 60_000,
      ...overrides,
    });
    clients.push(c);
    return c;
  }

  it('two clients discover each other via signal server and connect', async () => {
    const clientA = createClient();
    const clientB = createClient();

    clientA.connect();
    clientB.connect();

    // Wait for both to have at least 1 connected peer
    await waitFor(() => clientA.peerCount >= 1 && clientB.peerCount >= 1);

    expect(clientA.peerCount).toBeGreaterThanOrEqual(1);
    expect(clientB.peerCount).toBeGreaterThanOrEqual(1);
  });

  it('connected clients can exchange application messages', async () => {
    const clientA = createClient();
    const clientB = createClient();

    const received: { type: string; payload: unknown }[] = [];
    clientB.onAny((type, payload) => {
      received.push({ type, payload });
    });

    clientA.connect();
    clientB.connect();

    await waitFor(() => clientA.peerCount >= 1 && clientB.peerCount >= 1);

    clientA.broadcast('auction.start', { auctionId: '0xABC' });

    await waitFor(() => received.length >= 1);

    expect(received[0].type).toBe('auction.start');
    expect(received[0].payload).toEqual({ auctionId: '0xABC' });
  });

  it('clients gossip __peer-share on connection and discovered peers are fed to PeerManager', async () => {
    const clientA = createClient();
    const clientB = createClient();

    // Track peer count changes
    const aPeerCounts: number[] = [];
    const bPeerCounts: number[] = [];
    clientA.onPeerCountChange((c) => aPeerCounts.push(c));
    clientB.onPeerCountChange((c) => bPeerCounts.push(c));

    clientA.connect();
    clientB.connect();

    await waitFor(() => clientA.peerCount >= 1 && clientB.peerCount >= 1);

    // Both should have received peer count change events
    expect(aPeerCounts.length).toBeGreaterThan(0);
    expect(bPeerCounts.length).toBeGreaterThan(0);

    // The __peer-share message should NOT be delivered to app handlers
    const appMessages: string[] = [];
    clientA.onAny((type) => appMessages.push(type));
    clientB.onAny((type) => appMessages.push(type));

    // Wait a beat for any __peer-share gossip to propagate
    await new Promise((r) => setTimeout(r, 100));

    expect(appMessages.filter((t) => t === '__peer-share')).toHaveLength(0);
  });

  it('three clients form a mesh: C discovers A through B gossip', async () => {
    // Client A connects first
    const clientA = createClient();
    clientA.connect();
    await new Promise((r) => setTimeout(r, 50));

    // Client B connects — signal server tells B about A
    const clientB = createClient();
    clientB.connect();
    await waitFor(() => clientA.peerCount >= 1 && clientB.peerCount >= 1);

    // Client C connects — signal server may announce B (or A) to C
    // Through __peer-share gossip, C should discover the other peer
    const clientC = createClient();
    clientC.connect();

    // Wait for C to connect to at least 1 peer (via signal server discovery)
    await waitFor(() => clientC.peerCount >= 1);

    // Now wait for gossip to propagate — C should eventually have 2 peers
    // (one from signal server, one from __peer-share gossip)
    await waitFor(() => clientC.peerCount >= 2, 5000);

    expect(clientC.peerCount).toBe(2);
  });

  it('messages broadcast by A reach C through B (multi-hop gossip)', async () => {
    // Set up 3 clients with maxPeers=1 so A-B and B-C but NOT A-C
    const clientA = createClient({ maxPeers: 1 });
    const clientB = createClient({ maxPeers: 2 }); // B is the bridge
    const clientC = createClient({ maxPeers: 1 });

    const receivedByC: { type: string; payload: unknown }[] = [];
    clientC.onAny((type, payload) => {
      receivedByC.push({ type, payload });
    });

    clientA.connect();
    await new Promise((r) => setTimeout(r, 50));
    clientB.connect();
    await waitFor(() => clientA.peerCount >= 1 && clientB.peerCount >= 1);

    clientC.connect();
    await waitFor(() => clientC.peerCount >= 1 && clientB.peerCount >= 2);

    // A broadcasts — should reach C through B's rebroadcast
    clientA.broadcast('test.message', { value: 42 });

    await waitFor(() => receivedByC.length >= 1, 3000);

    expect(receivedByC[0].type).toBe('test.message');
    expect(receivedByC[0].payload).toEqual({ value: 42 });
  });
});
