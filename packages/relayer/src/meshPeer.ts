import type { SubscriptionManager } from './transport/types';

/**
 * Minimal MeshClient interface — imported dynamically at runtime from @sapience/relay.
 * Typed here to avoid cross-package rootDir issues at compile time.
 */
interface MeshClientLike {
  connect(): void;
  disconnect(): void;
  broadcast(type: string, payload: unknown): void;
  onAny(handler: (type: string, payload: unknown) => void): () => void;
  readonly peerCount: number;
  onPeerCountChange(cb: (count: number) => void): () => void;
}

type MeshClientConstructor = new (config: { signalUrl: string }) => MeshClientLike;

/**
 * Dynamically import the MeshClient to avoid compile-time cross-package issues.
 */
async function loadMeshClient(): Promise<MeshClientConstructor> {
  // Use variable to prevent static analysis from checking the module path
  const modPath = '@sapience/relay/mesh/MeshClient';
  const mod = (await import(/* webpackIgnore: true */ modPath)) as Record<string, unknown>;
  return mod.MeshClient as MeshClientConstructor;
}

/**
 * Bridge between the relayer's local SubscriptionManager and the peer mesh.
 *
 * - Mesh messages → local broadcast (reaches locally-connected WS clients)
 * - Local broadcasts → mesh gossip (reaches all mesh peers)
 */
export async function attachMeshGossip(
  localSubs: SubscriptionManager,
  signalUrl: string
): Promise<MeshClientLike> {
  const MeshClientImpl = await loadMeshClient();
  const mesh = new MeshClientImpl({ signalUrl });

  // Inbound: mesh → local WS clients
  mesh.onAny((type, payload) => {
    const topic = mapTypeToTopic(type, payload);
    if (topic) {
      localSubs.broadcast(topic, { type, payload });
    }
  });

  mesh.connect();
  return mesh;
}

/**
 * Wraps localSubs so that every local broadcast ALSO gossips to mesh.
 */
export function createMeshBridgedSubs(
  localSubs: SubscriptionManager,
  mesh: MeshClientLike
): SubscriptionManager {
  return {
    subscribe: localSubs.subscribe.bind(localSubs),
    unsubscribe: localSubs.unsubscribe.bind(localSubs),
    unsubscribeAll: localSubs.unsubscribeAll.bind(localSubs),
    unsubscribeByPrefix: localSubs.unsubscribeByPrefix.bind(localSubs),
    subscriberCount: localSubs.subscriberCount.bind(localSubs),
    broadcast(topic: string, msg: unknown): number {
      const localCount = localSubs.broadcast(topic, msg);
      const parsed =
        typeof msg === 'object' && msg !== null
          ? (msg as Record<string, unknown>)
          : {};
      mesh.broadcast(
        (parsed.type as string) ?? topic,
        parsed.payload ?? msg
      );
      return localCount;
    },
    broadcastRaw(topic: string, raw: string): number {
      const localCount = localSubs.broadcastRaw(topic, raw);
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        mesh.broadcast(
          (parsed.type as string) ?? topic,
          parsed.payload ?? parsed
        );
      } catch {
        /* skip unparseable */
      }
      return localCount;
    },
  };
}

function mapTypeToTopic(type: string, payload: unknown): string | null {
  const p = payload as Record<string, unknown>;
  if (type === 'auction.bids' && p.auctionId)
    return `auction:${p.auctionId}`;
  if (type === 'auction.started') return null;
  if (type === 'bid.submit' && p.auctionId)
    return `auction:${p.auctionId}`;
  return null;
}
