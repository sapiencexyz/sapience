'use client';

import { MeshClient } from '@sapience/relay/mesh/MeshClient';
import { MeshTransport } from '@sapience/relay/mesh/MeshTransport';

const SIGNAL_URL =
  process.env.NEXT_PUBLIC_SIGNAL_URL || 'wss://signal.sapience.xyz';

class MeshAuctionClient {
  private mesh: MeshClient | null = null;
  private transport: MeshTransport | null = null;

  private ensureMesh(): MeshClient {
    if (!this.mesh) {
      this.mesh = new MeshClient({ signalUrl: SIGNAL_URL });
      this.mesh.connect();
      this.transport = new MeshTransport(this.mesh);
    }
    return this.mesh;
  }

  ensure(): MeshTransport {
    this.ensureMesh();
    if (!this.transport) throw new Error('MeshAuctionClient not initialized');
    return this.transport;
  }

  get peerCount(): number {
    return this.mesh?.peerCount ?? 0;
  }

  onPeerCountChange(cb: (count: number) => void): () => void {
    return this.ensureMesh().onPeerCountChange(cb);
  }
}

const shared = new MeshAuctionClient();

/**
 * Drop-in replacement for getSharedAuctionWsClient.
 * Returns MeshTransport which has the same interface as ReconnectingWebSocketClient.
 */
export function getSharedMeshClient(): MeshTransport {
  return shared.ensure();
}

/** Peer count for UI */
export function getMeshPeerCount(): number {
  return shared.peerCount;
}

export function onMeshPeerCountChange(
  cb: (count: number) => void
): () => void {
  return shared.onPeerCountChange(cb);
}
