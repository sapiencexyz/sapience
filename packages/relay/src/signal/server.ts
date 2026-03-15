import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

interface SignalMessage {
  type: string;
  target: string;
  from?: string;
  data: unknown;
}

const MAX_PEERS_ANNOUNCE = 8;
const HEARTBEAT_INTERVAL_MS = 30_000;

const port = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({ port });
const peers = new Map<string, WebSocket>();

function randomSubset<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

wss.on('connection', (ws: WebSocket) => {
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
      const msg = JSON.parse(String(raw)) as SignalMessage;
      if (msg.type === 'pong') return;
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
