import { PeerConnection } from './PeerConnection';

export interface PeerManagerConfig {
  signalUrl: string;
  maxPeers?: number;
  /** Max entries in the known-peers map. Default 500. */
  maxKnownPeers?: number;
  /** Drop known peers not seen within this many ms. Default 30 000 (30s). */
  stalePeerMs?: number;
  rtcConfig?: RTCConfiguration;
  /** Enable verbose console logging. Default false. */
  debug?: boolean;
}

export interface PeerManagerEvents {
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onMessage: (peerId: string, data: string) => void;
  onPeerCountChanged: (count: number) => void;
  onSignalStateChanged: (connected: boolean) => void;
}

interface SignalMsg {
  type: string;
  from?: string;
  target?: string;
  peerId?: string;
  peers?: string[];
  yourId?: string;
  data?: unknown;
}

const DEFAULT_MAX_PEERS = 25;
const DEFAULT_MAX_KNOWN_PEERS = 500;
const DEFAULT_STALE_PEER_MS = 30_000;
const PRUNE_INTERVAL_MS = 10_000;

export class PeerManager {
  private peers = new Map<string, PeerConnection>();
  private signal: WebSocket | null = null;
  private config: Required<PeerManagerConfig>;
  private events: PeerManagerEvents;
  private myId: string | null = null;
  /** peerId → lastSeen timestamp. Peers not seen within stalePeerMs are pruned. */
  private knownPeers = new Map<string, number>();
  private backoffMs = 400;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(config: PeerManagerConfig, events: PeerManagerEvents) {
    this.config = {
      signalUrl: config.signalUrl,
      maxPeers: config.maxPeers ?? DEFAULT_MAX_PEERS,
      maxKnownPeers: config.maxKnownPeers ?? DEFAULT_MAX_KNOWN_PEERS,
      stalePeerMs: config.stalePeerMs ?? DEFAULT_STALE_PEER_MS,
      rtcConfig: config.rtcConfig ?? {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
      debug: config.debug ?? false,
    };
    this.events = events;
  }

  private log(msg: string): void {
    if (this.config.debug) console.log(`[PeerManager] ${msg}`);
  }

  connect(): void {
    this.closed = false;
    this.connectSignal();
    this.pruneTimer = setInterval(
      () => this.pruneStalePeers(),
      PRUNE_INTERVAL_MS
    );
  }

  get peerCount(): number {
    return [...this.peers.values()].filter((p) => p.isOpen).length;
  }

  get signalConnected(): boolean {
    return this.signal !== null && this.signal.readyState === WebSocket.OPEN;
  }

  get knownPeerCount(): number {
    return this.knownPeers.size;
  }

  broadcastToPeers(data: string): number {
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (peer.send(data)) sent++;
    }
    return sent;
  }

  /** Send data to a specific subset of peers. */
  sendToPeers(data: string, peerIds: string[]): number {
    let sent = 0;
    for (const id of peerIds) {
      const peer = this.peers.get(id);
      if (peer && peer.send(data)) sent++;
    }
    return sent;
  }

  /** Returns IDs of peers with open data channels. */
  getConnectedPeerIds(): string[] {
    return [...this.peers.entries()]
      .filter(([, peer]) => peer.isOpen)
      .map(([id]) => id);
  }

  /** Update maxPeers at runtime and trim excess connections if needed. */
  setMaxPeers(n: number): void {
    this.config.maxPeers = Math.max(1, n);
    // Trim excess connections
    const connected = this.getConnectedPeerIds();
    while (connected.length > this.config.maxPeers) {
      const id = connected.pop()!;
      this.removePeer(id);
    }
  }

  /** Inject peer IDs discovered via gossip and attempt connections. */
  addDiscoveredPeers(peerIds: string[]): void {
    let added = false;
    for (const id of peerIds) {
      if (id === this.myId) continue;
      if (!this.knownPeers.has(id)) added = true;
      this.touchPeer(id);
      if (this.peers.size < this.config.maxPeers) {
        this.initiateConnection(id);
      }
    }
    if (added) {
      this.events.onPeerCountChanged(this.peerCount);
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.knownPeers.clear();
    this.signal?.close();
    this.signal = null;
  }

  /** Record that we've heard from/about a peer. Enforces the cap. */
  private touchPeer(id: string): void {
    this.knownPeers.set(id, Date.now());
    // Enforce cap by evicting oldest non-connected peers
    if (this.knownPeers.size > this.config.maxKnownPeers) {
      this.evictOldest();
    }
  }

  /** Remove oldest non-connected peers until we're at the cap. */
  private evictOldest(): void {
    const sorted = [...this.knownPeers.entries()]
      .filter(([id]) => !this.peers.has(id))
      .sort((a, b) => a[1] - b[1]);
    for (const [id] of sorted) {
      if (this.knownPeers.size <= this.config.maxKnownPeers) break;
      this.knownPeers.delete(id);
    }
  }

  /** Drop peers we haven't heard from within stalePeerMs. */
  private pruneStalePeers(): void {
    const cutoff = Date.now() - this.config.stalePeerMs;
    let pruned = false;
    for (const [id, lastSeen] of this.knownPeers) {
      if (lastSeen < cutoff && !this.peers.has(id)) {
        this.knownPeers.delete(id);
        pruned = true;
      }
    }
    if (pruned) {
      this.events.onPeerCountChanged(this.peerCount);
    }
  }

  private connectSignal(): void {
    if (this.closed) return;
    try {
      const ws = new WebSocket(this.config.signalUrl);
      this.signal = ws;

      ws.onopen = () => {
        this.backoffMs = 400;
        this.events.onSignalStateChanged(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as SignalMsg;
          this.handleSignalMessage(msg);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        this.signal = null;
        this.events.onSignalStateChanged(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        /* onclose will fire */
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(this.backoffMs + jitter, 30_000);
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSignal();
    }, delay);
  }

  private handleSignalMessage(msg: SignalMsg): void {
    switch (msg.type) {
      case 'peers': {
        if (msg.yourId) this.myId = msg.yourId;
        for (const id of msg.peers ?? []) {
          if (id === this.myId) continue;
          this.touchPeer(id);
          if (this.peers.size < this.config.maxPeers) {
            this.initiateConnection(id);
          }
        }
        if (this.knownPeers.size > 0) {
          this.events.onPeerCountChanged(this.peerCount);
        }
        break;
      }
      case 'peer-joined': {
        if (msg.peerId && msg.peerId !== this.myId) {
          this.touchPeer(msg.peerId);
          this.events.onPeerCountChanged(this.peerCount);
          if (this.peers.size < this.config.maxPeers) {
            this.initiateConnection(msg.peerId);
          }
        }
        break;
      }
      case 'peer-left': {
        if (msg.peerId) {
          this.knownPeers.delete(msg.peerId);
          this.events.onPeerCountChanged(this.peerCount);
          this.removePeer(msg.peerId);
        }
        break;
      }
      case 'offer': {
        if (msg.from) {
          this.touchPeer(msg.from);
          if (this.peers.size < this.config.maxPeers) {
            this.log(`received offer from ${msg.from.slice(0, 8)}, accepting`);
            this.handleOffer(msg.from, msg.data as RTCSessionDescriptionInit);
          } else {
            this.log(
              `received offer from ${msg.from.slice(0, 8)}, REJECTED — at max peers (${this.peers.size}/${this.config.maxPeers})`
            );
          }
        }
        break;
      }
      case 'answer': {
        if (msg.from) {
          this.touchPeer(msg.from);
          const peer = this.peers.get(msg.from);
          if (peer) {
            this.log(`received answer from ${msg.from.slice(0, 8)}`);
            peer.setAnswer(msg.data as RTCSessionDescriptionInit).catch((e) => {
              this.log(`setAnswer failed for ${msg.from!.slice(0, 8)}: ${e}`);
              this.removePeer(msg.from!);
            });
          } else {
            this.log(
              `received answer from ${msg.from.slice(0, 8)} but no peer entry exists`
            );
          }
        }
        break;
      }
      case 'ice-candidate': {
        if (msg.from) {
          this.touchPeer(msg.from);
          const peer = this.peers.get(msg.from);
          if (peer) {
            peer.addIceCandidate(msg.data as RTCIceCandidateInit).catch(() => {
              /* ignore late ICE */
            });
          }
        }
        break;
      }
    }
  }

  private initiateConnection(peerId: string): void {
    if (this.peers.has(peerId)) {
      this.log(`skip initiate ${peerId.slice(0, 8)} — already have peer`);
      return;
    }
    // Only the peer with the higher ID initiates — eliminates glare entirely
    if (this.myId && this.myId < peerId) {
      this.log(
        `skip initiate ${peerId.slice(0, 8)} — my ID ${this.myId?.slice(0, 8)} is lower (waiting for their offer)`
      );
      return;
    }
    this.log(
      `initiating connection to ${peerId.slice(0, 8)} (my ID ${this.myId?.slice(0, 8)})`
    );
    const peer = this.createPeer(peerId);
    this.peers.set(peerId, peer);

    peer
      .createOffer()
      .then((offer) => {
        if (this.peers.get(peerId) !== peer) return;
        this.sendSignal({ type: 'offer', target: peerId, data: offer });
      })
      .catch(() => {
        if (this.peers.get(peerId) === peer) this.removePeer(peerId);
      });
  }

  private handleOffer(fromId: string, offer: RTCSessionDescriptionInit): void {
    if (this.peers.has(fromId)) return;
    const peer = this.createPeer(fromId);
    this.peers.set(fromId, peer);

    peer
      .acceptOffer(offer)
      .then((answer) => {
        if (this.peers.get(fromId) !== peer) {
          this.log(`peer ${fromId.slice(0, 8)} replaced before answer sent`);
          return;
        }
        this.log(`sending answer to ${fromId.slice(0, 8)}`);
        this.sendSignal({ type: 'answer', target: fromId, data: answer });
      })
      .catch((e) => {
        this.log(`acceptOffer failed for ${fromId.slice(0, 8)}: ${e}`);
        if (this.peers.get(fromId) === peer) this.removePeer(fromId);
      });
  }

  private createPeer(peerId: string): PeerConnection {
    const peer = new PeerConnection(
      peerId,
      this.config.rtcConfig,
      {
        onOpen: () => {
          this.touchPeer(peerId);
          this.events.onPeerConnected(peerId);
          this.events.onPeerCountChanged(this.peerCount);
        },
        onClose: () => {
          this.removePeer(peerId);
        },
        onMessage: (data) => {
          this.touchPeer(peerId);
          this.events.onMessage(peerId, data);
        },
        onError: () => {
          this.removePeer(peerId);
        },
      },
      this.config.debug
    );

    peer.onIceCandidate = (candidate) => {
      this.sendSignal({
        type: 'ice-candidate',
        target: peerId,
        data: candidate,
      });
    };

    return peer;
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.close();
    this.peers.delete(peerId);
    this.events.onPeerDisconnected(peerId);
    this.events.onPeerCountChanged(this.peerCount);
    this.fillPeerSlots();
  }

  private fillPeerSlots(): void {
    for (const id of this.knownPeers.keys()) {
      if (this.peers.size >= this.config.maxPeers) break;
      if (!this.peers.has(id)) {
        this.initiateConnection(id);
      }
    }
  }

  private sendSignal(msg: Record<string, unknown>): void {
    if (this.signal && this.signal.readyState === WebSocket.OPEN) {
      this.signal.send(JSON.stringify(msg));
    }
  }
}
