'use client';

import { MeshClient } from '@sapience/relay/mesh/MeshClient';
import { MeshTransport } from '@sapience/relay/mesh/MeshTransport';

const RL_KEY = 'sapience.settings.meshRateLimit';
const MAX_PEERS_KEY = 'sapience.settings.meshMaxPeers';
const FANOUT_KEY = 'sapience.settings.meshFanout';
const DEFAULT_RL = 30;
const DEFAULT_MAX_PEERS = 6;
const DEFAULT_FANOUT = 0;

/**
 * Derive the signal WebSocket URL from the relayer base URL.
 * The relayer serves signaling at /signal on the same origin.
 * e.g. https://relayer.sapience.xyz/auction → wss://relayer.sapience.xyz/signal
 */
function getSignalUrl(): string {
  // Check explicit override first
  const explicit = process.env.NEXT_PUBLIC_SIGNAL_URL;
  if (explicit) return explicit;

  // Derive from relayer base URL (stored in settings or env)
  try {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('sapience.settings.apiBaseUrl')
        : null;
    const base =
      stored ||
      process.env.NEXT_PUBLIC_FOIL_RELAYER_URL ||
      process.env.NEXT_PUBLIC_FOIL_API_URL ||
      '';

    if (base) {
      const u = new URL(base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/signal';
      u.search = '';
      return u.toString();
    }

    // Fallback: derive from current page origin
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/signal`;
    }
  } catch {
    /* */
  }

  return 'wss://relayer.sapience.xyz/signal';
}

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

  onPeerCountChange(cb: (count: number) => void): () => void {
    return this.ensureMesh().onPeerCountChange(cb);
  }

  onBandwidthChange(cb: (kbps: number) => void): () => void {
    return this.ensureMesh().onBandwidthChange(cb);
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
