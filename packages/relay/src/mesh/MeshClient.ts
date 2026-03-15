import { PeerManager } from '../peer/PeerManager';
import { GossipProtocol } from '../gossip/GossipProtocol';
import type { GossipConfig } from '../gossip/GossipProtocol';

export interface MeshConfig {
  signalUrl: string;
  maxPeers?: number;
  gossip?: GossipConfig;
}

export type MessageHandler = (type: string, payload: unknown) => void;

export class MeshClient {
  private peerManager: PeerManager;
  private gossip: GossipProtocol;
  private handlers = new Map<string, Set<MessageHandler>>();
  private allHandlers = new Set<MessageHandler>();
  private peerCountListeners = new Set<(count: number) => void>();
  private nodeId: string;

  constructor(config: MeshConfig) {
    this.nodeId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Math.random().toString(36).slice(2)}${Date.now()}`;

    this.gossip = new GossipProtocol(this.nodeId, config.gossip);

    this.peerManager = new PeerManager(
      {
        signalUrl: config.signalUrl,
        maxPeers: config.maxPeers,
      },
      {
        onPeerConnected: () => {},
        onPeerDisconnected: () => {},
        onMessage: (_peerId, data) => this.handlePeerMessage(data),
        onPeerCountChanged: (count) => {
          for (const cb of this.peerCountListeners) {
            try {
              cb(count);
            } catch {
              /* no-op */
            }
          }
        },
      }
    );
  }

  connect(): void {
    this.peerManager.connect();
  }

  disconnect(): void {
    this.peerManager.disconnect();
    this.gossip.destroy();
  }

  broadcast(type: string, payload: unknown): void {
    const msg = this.gossip.createMessage(type, payload);
    const serialized = this.gossip.serialize(msg);
    this.peerManager.broadcastToPeers(serialized);
  }

  on(type: string, handler: MessageHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.handlers.delete(type);
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

  private handlePeerMessage(data: string): void {
    const msg = this.gossip.processIncoming(data);
    if (!msg) return;

    // Re-broadcast to other peers
    const serialized = this.gossip.serialize(msg);
    this.peerManager.broadcastToPeers(serialized);

    // Deliver to local handlers
    const typeHandlers = this.handlers.get(msg.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(msg.type, msg.payload);
        } catch {
          /* no-op */
        }
      }
    }
    for (const handler of this.allHandlers) {
      try {
        handler(msg.type, msg.payload);
      } catch {
        /* no-op */
      }
    }
  }
}
