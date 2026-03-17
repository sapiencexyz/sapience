'use client';

import { getSignalUrl } from './signalUrl';
import { MeshClient } from '~/lib/mesh/MeshClient';
import { MeshTransport } from '~/lib/mesh/MeshTransport';

const RL_KEY = 'sapience.settings.meshRateLimit';
const MAX_PEERS_KEY = 'sapience.settings.meshMaxPeers';
const FANOUT_KEY = 'sapience.settings.meshFanout';
const DEFAULT_RL = 100;
const DEFAULT_MAX_PEERS = 25;
const DEFAULT_FANOUT = 0;

function readRateLimit(): number {
  try {
    const v =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(RL_KEY)
        : null;
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
  } catch {
    /* */
  }
  return DEFAULT_RL;
}

function readMaxPeers(): number {
  try {
    const v =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(MAX_PEERS_KEY)
        : null;
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
  } catch {
    /* */
  }
  return DEFAULT_MAX_PEERS;
}

function readFanout(): number {
  try {
    const v =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(FANOUT_KEY)
        : null;
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    /* */
  }
  return DEFAULT_FANOUT;
}

class MeshAuctionClient {
  private mesh: MeshClient | null = null;
  private transport: MeshTransport | null = null;

  private ensureMesh(): MeshClient {
    if (!this.mesh) {
      this.mesh = new MeshClient({
        signalUrl: getSignalUrl(),
        rateLimitPerSec: readRateLimit(),
        maxPeers: readMaxPeers(),
        maxFanout: readFanout(),
      });
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
  get bandwidthKbps(): number {
    return this.mesh?.bandwidthKbps ?? 0;
  }

  get signalConnected(): boolean {
    return this.mesh?.signalConnected ?? false;
  }

  get knownPeerCount(): number {
    return this.mesh?.knownPeerCount ?? 0;
  }

  onPeerCountChange(cb: (count: number) => void): () => void {
    return this.ensureMesh().onPeerCountChange(cb);
  }

  onBandwidthChange(cb: (kbps: number) => void): () => void {
    return this.ensureMesh().onBandwidthChange(cb);
  }

  onSignalStateChange(cb: (connected: boolean) => void): () => void {
    return this.ensureMesh().onSignalStateChange(cb);
  }

  setRateLimit(n: number): void {
    this.mesh?.setRateLimit(n);
  }

  setMaxPeers(n: number): void {
    this.mesh?.setMaxPeers(n);
  }

  setMaxFanout(n: number): void {
    this.mesh?.setMaxFanout(n);
  }
}

const shared = new MeshAuctionClient();

export function getSharedMeshClient(): MeshTransport {
  return shared.ensure();
}
export function getMeshPeerCount(): number {
  return shared.peerCount;
}
export function getMeshBandwidthKbps(): number {
  return shared.bandwidthKbps;
}
export function onMeshPeerCountChange(cb: (count: number) => void): () => void {
  return shared.onPeerCountChange(cb);
}
export function onMeshBandwidthChange(cb: (kbps: number) => void): () => void {
  return shared.onBandwidthChange(cb);
}
export function setMeshRateLimit(n: number): void {
  shared.setRateLimit(n);
}
export function setMeshMaxPeers(n: number): void {
  shared.setMaxPeers(n);
}
export function setMeshFanout(n: number): void {
  shared.setMaxFanout(n);
}

export function getMeshSignalConnected(): boolean {
  return shared.signalConnected;
}
export function getMeshKnownPeerCount(): number {
  return shared.knownPeerCount;
}
export function onMeshSignalStateChange(
  cb: (connected: boolean) => void
): () => void {
  return shared.onSignalStateChange(cb);
}
