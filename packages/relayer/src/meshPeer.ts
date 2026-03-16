import type { SubscriptionManager } from './transport/types';
import { isValidGossipPayload } from '@sapience/sdk/auction/gossipValidation';

/** Minimal MeshClient shape for type safety without cross-package rootDir issues. */
interface MeshClientLike {
  connect(): void;
  disconnect(): void;
  broadcast(type: string, payload: unknown): string;
  onAny(handler: (type: string, payload: unknown) => void): () => void;
  readonly peerCount: number;
  onPeerCountChange(cb: (count: number) => void): () => void;
}

type MeshCtor = new (config: { signalUrl: string }) => MeshClientLike;

async function loadMeshClient(): Promise<MeshCtor> {
  const p = '@sapience/relay/mesh/MeshClient';
  const mod = (await import(/* webpackIgnore: true */ p)) as Record<
    string,
    unknown
  >;
  return mod.MeshClient as MeshCtor;
}

/**
 * Bridge between the relayer's local SubscriptionManager and the peer mesh.
 */
export async function attachMeshGossip(
  localSubs: SubscriptionManager,
  signalUrl: string
): Promise<MeshClientLike> {
  const Ctor = await loadMeshClient();
  const mesh = new Ctor({ signalUrl });

  mesh.onAny((type, payload) => {
    if (!isValidGossipPayload(type, payload)) return;
    const topic = mapTypeToTopic(type, payload);
    if (topic) localSubs.broadcast(topic, { type, payload });
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
      mesh.broadcast((parsed.type as string) ?? topic, parsed.payload ?? msg);
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
        /* skip */
      }
      return localCount;
    },
  };
}

function mapTypeToTopic(type: string, payload: unknown): string | null {
  const p = payload as Record<string, unknown>;
  if (
    (type === 'auction.bids' ||
      type === 'bid.submit' ||
      type === 'auction.start' ||
      type === 'vault_quote.update') &&
    p.auctionId
  )
    return `auction:${p.auctionId}`;
  return null;
}
