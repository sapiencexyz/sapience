import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

const MAX_PEERS_ANNOUNCE = 8;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS = 200;
const MAX_MESSAGE_SIZE = 16_384; // 16 KB
const RATE_LIMIT_PER_SEC = 10;

/** Only these message types are forwarded between peers. */
const ALLOWED_SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);

const port = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({ port });
const peers = new Map<string, WebSocket>();
const peerMsgTimestamps = new Map<string, number[]>();

function randomSubset<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

wss.on('connection', (ws: WebSocket) => {
  // Enforce connection cap
  if (peers.size >= MAX_CONNECTIONS) {
    ws.close(1013, 'max connections reached');
    return;
  }

  const peerId = randomUUID();
  peers.set(peerId, ws);

  // Send peer list to newcomer
  const otherPeerIds = [...peers.keys()].filter((id) => id !== peerId);
  const subset = randomSubset(otherPeerIds, MAX_PEERS_ANNOUNCE);
  ws.send(JSON.stringify({ type: 'peers', peers: subset, yourId: peerId }));

  // Announce to existing peers
  for (const [id, sock] of peers) {
    if (id !== peerId && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: 'peer-joined', peerId }));
    }
  }

  ws.on('message', (raw: Buffer | string) => {
    try {
      const rawStr = String(raw);

      // Max message size
      if (rawStr.length > MAX_MESSAGE_SIZE) return;

      // Per-peer rate limit
      const now = Date.now();
      let ts = peerMsgTimestamps.get(peerId);
      if (!ts) {
        ts = [];
        peerMsgTimestamps.set(peerId, ts);
      }
      while (ts.length > 0 && now - ts[0] > 1_000) ts.shift();
      if (ts.length >= RATE_LIMIT_PER_SEC) return;
      ts.push(now);

      const msg = JSON.parse(rawStr) as {
        type: string;
        target?: string;
        data?: unknown;
      };
      if (msg.type === 'pong') return;

      // Only allow WebRTC signaling message types
      if (!ALLOWED_SIGNAL_TYPES.has(msg.type)) return;
      if (!msg.target) return;

      const target = peers.get(msg.target);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ ...msg, from: peerId }));
      }
    } catch {
      /* ignore unparseable */
    }
  });

  ws.on('close', () => {
    peers.delete(peerId);
    peerMsgTimestamps.delete(peerId);
    for (const [, sock] of peers) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'peer-left', peerId }));
      }
    }
  });

  // Ping/pong heartbeat
  const alive = { value: true };
  ws.on('pong', () => {
    alive.value = true;
  });

  const heartbeat = setInterval(() => {
    if (!alive.value) {
      ws.terminate();
      return;
    }
    alive.value = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  ws.on('close', () => clearInterval(heartbeat));
});

console.log(`Signal server listening on port ${port}`);

export { wss };
