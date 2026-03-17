import { PeerManager } from './PeerManager';

export interface MeshConfig {
  signalUrl: string;
  maxPeers?: number;
  /** Max messages to track for dedup. Default 10_000. */
  maxSeenSize?: number;
  /** Max age (ms) for seen messages before eviction. Default 120_000 (2 min). */
  seenTtlMs?: number;
  /** Max hop count before dropping. Default 10. */
  maxHops?: number;
  /** Max inbound messages per peer per second. 0 = unlimited. Default 100. */
  rateLimitPerSec?: number;
  /** Max inbound message size in bytes. Default 16_384. */
  maxMessageSize?: number;
  /** Max peers to forward to per rebroadcast. 0 = all. Default 0. */
  maxFanout?: number;
  /** Enable verbose console logging. Default false. */
  debug?: boolean;
}

export type MessageHandler = (type: string, payload: unknown) => void;

interface GossipEnvelope {
  id: string;
  type: string;
  payload: unknown;
  origin: string;
  hops: number;
  ts: number;
}

const PRUNE_INTERVAL_MS = 30_000;
const BW_WINDOW_MS = 5_000;
/** Internal message type for sharing peer lists over data channels. */
const PEER_SHARE_TYPE = '__peer-share';
const PEER_SHARE_INTERVAL_MS = 60_000;
/** Max peer IDs accepted per __peer-share message. */
const MAX_PEER_SHARE_IDS = 20;
/** Peer IDs must look like UUIDs or hex strings (8–64 chars, alphanumeric + hyphens). */
const PEER_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function isValidEnvelope(v: unknown): v is GossipEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.type === 'string' &&
    m.type.length > 0 &&
    typeof m.hops === 'number' &&
    Number.isFinite(m.hops) &&
    typeof m.ts === 'number' &&
    Number.isFinite(m.ts) &&
    typeof m.origin === 'string'
  );
}

export class MeshClient {
  private peerManager: PeerManager;
  private nodeId = makeId();
  private handlers = new Map<string, Set<MessageHandler>>();
  private allHandlers = new Set<MessageHandler>();
  private peerCountListeners = new Set<(count: number) => void>();
  private bandwidthListeners = new Set<(kbps: number) => void>();
  private signalStateListeners = new Set<(connected: boolean) => void>();

  // Gossip state (was GossipProtocol)
  private seen = new Map<string, number>();
  private peerMsgTimestamps = new Map<string, number[]>();
  private maxSeenSize: number;
  private seenTtlMs: number;
  private maxHops: number;
  private rateLimitPerSec: number;
  private maxMessageSize: number;
  private maxFanout: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private peerShareTimer: ReturnType<typeof setInterval> | null = null;

  // Bandwidth tracking
  private byteLog: [number, number][] = [];
  private bwTimer: ReturnType<typeof setInterval> | null = null;
  private _lastKbps = 0;

  constructor(config: MeshConfig) {
    this.maxSeenSize = config.maxSeenSize ?? 10_000;
    this.seenTtlMs = config.seenTtlMs ?? 120_000;
    this.maxHops = config.maxHops ?? 10;
    this.rateLimitPerSec = config.rateLimitPerSec ?? 100;
    this.maxMessageSize = config.maxMessageSize ?? 16_384;
    this.maxFanout = config.maxFanout ?? 0;

    this.peerManager = new PeerManager(
      {
        signalUrl: config.signalUrl,
        maxPeers: config.maxPeers,
        debug: config.debug,
      },
      {
        onPeerConnected: () => {
          this.sharePeers();
        },
        onPeerDisconnected: () => {},
        onMessage: (peerId, data) => {
          this.recordBytes(data.length);
          this.handleIncoming(data, peerId);
        },
        onPeerCountChanged: (count) => {
          for (const cb of this.peerCountListeners) {
            try {
              cb(count);
            } catch {
              /* */
            }
          }
        },
        onSignalStateChanged: (connected) => {
          for (const cb of this.signalStateListeners) {
            try {
              cb(connected);
            } catch {
              /* */
            }
          }
        },
      }
    );
  }

  connect(): void {
    this.peerManager.connect();
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);
    this.bwTimer = setInterval(() => this.emitBandwidth(), 1_000);
    this.peerShareTimer = setInterval(
      () => this.sharePeers(),
      PEER_SHARE_INTERVAL_MS
    );
  }

  disconnect(): void {
    this.peerManager.disconnect();
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.bwTimer) {
      clearInterval(this.bwTimer);
      this.bwTimer = null;
    }
    if (this.peerShareTimer) {
      clearInterval(this.peerShareTimer);
      this.peerShareTimer = null;
    }
  }

  /** Broadcast a message to the mesh. Returns the gossip message ID. */
  broadcast(type: string, payload: unknown): string {
    const msg: GossipEnvelope = {
      id: makeId(),
      type,
      payload,
      origin: this.nodeId,
      hops: 0,
      ts: Date.now(),
    };
    this.seen.set(msg.id, Date.now());
    const raw = JSON.stringify(msg);
    this.recordBytes(raw.length);
    this.fanoutSend(raw);
    return msg.id;
  }

  on(type: string, handler: MessageHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(type);
    };
  }

  onAny(handler: MessageHandler): () => void {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  }

  get peerCount(): number {
    return this.peerManager.peerCount;
  }

  onPeerCountChange(cb: (count: number) => void): () => void {
    this.peerCountListeners.add(cb);
    return () => {
      this.peerCountListeners.delete(cb);
    };
  }

  get signalConnected(): boolean {
    return this.peerManager.signalConnected;
  }

  get knownPeerCount(): number {
    return this.peerManager.knownPeerCount;
  }

  get bandwidthKbps(): number {
    return this._lastKbps;
  }

  onSignalStateChange(cb: (connected: boolean) => void): () => void {
    this.signalStateListeners.add(cb);
    return () => {
      this.signalStateListeners.delete(cb);
    };
  }

  onBandwidthChange(cb: (kbps: number) => void): () => void {
    this.bandwidthListeners.add(cb);
    return () => {
      this.bandwidthListeners.delete(cb);
    };
  }

  setRateLimit(msgsPerSec: number): void {
    this.rateLimitPerSec = Math.max(0, msgsPerSec);
  }

  setMaxFanout(n: number): void {
    this.maxFanout = Math.max(0, n);
  }

  setMaxPeers(n: number): void {
    this.peerManager.setMaxPeers(n);
  }

  // --- Private: gossip + dedup ---

  /** Send to all peers or a random subset if maxFanout > 0. */
  private fanoutSend(data: string): void {
    if (this.maxFanout <= 0) {
      this.peerManager.broadcastToPeers(data);
      return;
    }
    const ids = this.peerManager.getConnectedPeerIds();
    if (ids.length <= this.maxFanout) {
      this.peerManager.broadcastToPeers(data);
      return;
    }
    // Fisher-Yates partial shuffle to pick maxFanout peers
    const fanout = Math.min(this.maxFanout, ids.length);
    for (let i = ids.length - 1; i > ids.length - 1 - fanout; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.peerManager.sendToPeers(data, ids.slice(ids.length - fanout));
  }

  private handleIncoming(raw: string, peerId: string): void {
    if (raw.length > this.maxMessageSize) return;

    let msg: GossipEnvelope;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidEnvelope(parsed)) return;
      msg = parsed;
    } catch {
      return;
    }

    if (this.seen.has(msg.id)) return;
    if (msg.hops >= this.maxHops) return;
    if (Date.now() - msg.ts > this.seenTtlMs) return;

    // Per-peer rate limit
    if (this.rateLimitPerSec > 0) {
      const now = Date.now();
      let ts = this.peerMsgTimestamps.get(peerId);
      if (!ts) {
        ts = [];
        this.peerMsgTimestamps.set(peerId, ts);
      }
      while (ts.length > 0 && now - ts[0] > 1_000) ts.shift();
      if (ts.length >= this.rateLimitPerSec) return;
      ts.push(now);
    }

    this.seen.set(msg.id, Date.now());
    msg.hops++;

    // Re-broadcast
    this.fanoutSend(JSON.stringify(msg));

    // Handle peer-sharing internally — do not deliver to app handlers
    if (msg.type === PEER_SHARE_TYPE) {
      const payload = msg.payload as { peers?: unknown[] };
      if (payload.peers && Array.isArray(payload.peers)) {
        const valid = payload.peers
          .filter(
            (id): id is string => typeof id === 'string' && PEER_ID_RE.test(id)
          )
          .slice(0, MAX_PEER_SHARE_IDS);
        if (valid.length > 0) {
          this.peerManager.addDiscoveredPeers(valid);
        }
      }
      return;
    }

    // Deliver to local handlers
    const typeHandlers = this.handlers.get(msg.type);
    if (typeHandlers) {
      for (const h of typeHandlers) {
        try {
          h(msg.type, msg.payload);
        } catch {
          /* */
        }
      }
    }
    for (const h of this.allHandlers) {
      try {
        h(msg.type, msg.payload);
      } catch {
        /* */
      }
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, ts] of this.seen) {
      if (now - ts > this.seenTtlMs) this.seen.delete(id);
    }
    if (this.seen.size > this.maxSeenSize) {
      const sorted = [...this.seen.entries()].sort((a, b) => a[1] - b[1]);
      for (const [id] of sorted.slice(0, this.seen.size - this.maxSeenSize)) {
        this.seen.delete(id);
      }
    }
    for (const [pid, ts] of this.peerMsgTimestamps) {
      while (ts.length > 0 && now - ts[0] > 1_000) ts.shift();
      if (ts.length === 0) this.peerMsgTimestamps.delete(pid);
    }
  }

  // --- Private: peer sharing ---

  private sharePeers(): void {
    const connectedPeers = this.peerManager.getConnectedPeerIds();
    if (connectedPeers.length === 0) return;
    this.broadcast(PEER_SHARE_TYPE, { peers: connectedPeers });
  }

  // --- Private: bandwidth ---

  private recordBytes(n: number): void {
    this.byteLog.push([Date.now(), n]);
  }

  private emitBandwidth(): void {
    const now = Date.now();
    while (this.byteLog.length > 0 && now - this.byteLog[0][0] > BW_WINDOW_MS)
      this.byteLog.shift();
    const total = this.byteLog.reduce((s, [, b]) => s + b, 0);
    this._lastKbps = Math.round(((total * 8) / BW_WINDOW_MS) * 10) / 10;
    for (const cb of this.bandwidthListeners) {
      try {
        cb(this._lastKbps);
      } catch {
        /* */
      }
    }
  }
}
