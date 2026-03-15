import { PeerConnection } from './PeerConnection';

export interface PeerManagerConfig {
  signalUrl: string;
  maxPeers?: number;
  rtcConfig?: RTCConfiguration;
}

export interface PeerManagerEvents {
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onMessage: (peerId: string, data: string) => void;
  onPeerCountChanged: (count: number) => void;
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

const DEFAULT_MAX_PEERS = 6;

export class PeerManager {
  private peers = new Map<string, PeerConnection>();
  private signal: WebSocket | null = null;
  private config: Required<PeerManagerConfig>;
  private events: PeerManagerEvents;
  private myId: string | null = null;
  private knownPeers = new Set<string>();
  private backoffMs = 400;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(config: PeerManagerConfig, events: PeerManagerEvents) {
    this.config = {
      signalUrl: config.signalUrl,
      maxPeers: config.maxPeers ?? DEFAULT_MAX_PEERS,
      rtcConfig: config.rtcConfig ?? {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    };
    this.events = events;
  }

  connect(): void {
    this.closed = false;
    this.connectSignal();
  }

  get peerCount(): number {
    let count = 0;
    for (const p of this.peers.values()) {
      if (p.isOpen) count++;
    }
    return count;
  }

  broadcastToPeers(data: string): number {
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (peer.send(data)) sent++;
    }
    return sent;
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.knownPeers.clear();
    this.signal?.close();
    this.signal = null;
  }

  private connectSignal(): void {
    if (this.closed) return;
    try {
      const ws = new WebSocket(this.config.signalUrl);
      this.signal = ws;

      ws.onopen = () => {
        this.backoffMs = 400;
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
          this.knownPeers.add(id);
          if (this.peers.size < this.config.maxPeers) {
            this.initiateConnection(id);
          }
        }
        break;
      }
      case 'peer-joined': {
        if (msg.peerId) {
          this.knownPeers.add(msg.peerId);
          if (this.peers.size < this.config.maxPeers) {
            this.initiateConnection(msg.peerId);
          }
        }
        break;
      }
      case 'peer-left': {
        if (msg.peerId) {
          this.knownPeers.delete(msg.peerId);
          this.removePeer(msg.peerId);
        }
        break;
      }
      case 'offer': {
        if (msg.from && this.peers.size < this.config.maxPeers) {
          this.handleOffer(msg.from, msg.data as RTCSessionDescriptionInit);
        }
        break;
      }
      case 'answer': {
        if (msg.from) {
          const peer = this.peers.get(msg.from);
          if (peer) {
            peer
              .setAnswer(msg.data as RTCSessionDescriptionInit)
              .catch(() => this.removePeer(msg.from!));
          }
        }
        break;
      }
      case 'ice-candidate': {
        if (msg.from) {
          const peer = this.peers.get(msg.from);
          if (peer) {
            peer
              .addIceCandidate(msg.data as RTCIceCandidateInit)
              .catch(() => {
                /* ignore late ICE */
              });
          }
        }
        break;
      }
    }
  }

  private initiateConnection(peerId: string): void {
    if (this.peers.has(peerId)) return;
    const peer = this.createPeer(peerId);
    this.peers.set(peerId, peer);

    peer
      .createOffer()
      .then((offer) => {
        this.sendSignal({ type: 'offer', target: peerId, data: offer });
      })
      .catch(() => this.removePeer(peerId));
  }

  private handleOffer(
    fromId: string,
    offer: RTCSessionDescriptionInit
  ): void {
    if (this.peers.has(fromId)) return;
    const peer = this.createPeer(fromId);
    this.peers.set(fromId, peer);

    peer
      .acceptOffer(offer)
      .then((answer) => {
        this.sendSignal({ type: 'answer', target: fromId, data: answer });
      })
      .catch(() => this.removePeer(fromId));
  }

  private createPeer(peerId: string): PeerConnection {
    const peer = new PeerConnection(peerId, this.config.rtcConfig, {
      onOpen: () => {
        this.events.onPeerConnected(peerId);
        this.events.onPeerCountChanged(this.peerCount);
      },
      onClose: () => {
        this.removePeer(peerId);
      },
      onMessage: (data) => {
        this.events.onMessage(peerId, data);
      },
      onError: () => {
        this.removePeer(peerId);
      },
    });

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
    for (const id of this.knownPeers) {
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
