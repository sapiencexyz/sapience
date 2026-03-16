import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

const MAX_PEERS_ANNOUNCE = 8;
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Only these message types are forwarded between peers. */
const ALLOWED_SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);

export interface SignalServerConfig {
  /** Max simultaneous connections. Default 200. */
  maxConnections?: number;
  /** Max inbound message size in bytes. Default 16 384 (16 KB). */
  maxMessageSize?: number;
  /** Max signaling messages per peer per second. Default 10. */
  rateLimitPerSec?: number;
}

function randomSubset<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * Creates a WebSocket server for WebRTC peer signaling.
 * Handles peer discovery, offer/answer/ICE relay, and heartbeats.
 * Intended to be attached to the relayer's HTTP server via `handleUpgrade`.
 *
 * This server is strictly a signaling relay — it does NOT forward
 * application-level gossip. Only offer/answer/ice-candidate messages
 * are routed between peers.
 */
export function createSignalWebSocketServer(
  config?: SignalServerConfig
): WebSocketServer {
  const MAX_CONNECTIONS = config?.maxConnections ?? 200;
  const MAX_MESSAGE_SIZE = config?.maxMessageSize ?? 16_384;
  const RATE_LIMIT_PER_SEC = config?.rateLimitPerSec ?? 10;

  const wss = new WebSocketServer({ noServer: true });
  const peers = new Map<string, WebSocket>();
  const peerMsgTimestamps = new Map<string, number[]>();

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
        if (RATE_LIMIT_PER_SEC > 0) {
          const now = Date.now();
          let ts = peerMsgTimestamps.get(peerId);
          if (!ts) {
            ts = [];
            peerMsgTimestamps.set(peerId, ts);
          }
          while (ts.length > 0 && now - ts[0] > 1_000) ts.shift();
          if (ts.length >= RATE_LIMIT_PER_SEC) return;
          ts.push(now);
        }

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
        /* ignore */
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

    // Heartbeat
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

  return wss;
}
