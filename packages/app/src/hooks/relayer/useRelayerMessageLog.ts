'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import {
  getSharedAuctionWsClient,
  getMessageSource,
  type MessageSource,
} from '~/lib/ws/AuctionWsClient';

export interface LoggedMessage {
  id: string;
  type: string;
  source: MessageSource | undefined;
  timestamp: number;
  payload: unknown;
}

export type GroupCategory = 'rfq' | 'vault' | 'secondary';

export interface MessageGroup {
  groupId: string;
  category: GroupCategory;
  messages: LoggedMessage[];
  createdAt: number;
  updatedAt: number;
}

const MAX_GROUPS = 200;
const GROUP_TTL_MS = 30 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60_000;
const SUBSCRIPTION_TTL_MS = 30 * 60 * 1000;

function extractGroupKey(
  type: string,
  msg: Record<string, unknown>
): { groupId: string; category: GroupCategory } | null {
  const payload = msg.payload as Record<string, unknown> | undefined;

  // Secondary types
  if (type.startsWith('secondary.')) {
    const auctionId =
      (payload?.auctionId as string) ||
      (msg.auctionId as string) ||
      (payload?.listingId as string) ||
      (msg.listingId as string);
    if (auctionId) return { groupId: auctionId, category: 'secondary' };
    return { groupId: `system:${type}`, category: 'secondary' };
  }

  // Vault types
  if (type.startsWith('vault_quote.') || type.startsWith('vault.')) {
    const chainId = (payload?.chainId as number) || (msg.chainId as number);
    const vaultAddress =
      (payload?.vaultAddress as string) || (msg.vaultAddress as string);
    if (chainId && vaultAddress) {
      return {
        groupId: `vault:${chainId}:${vaultAddress}`,
        category: 'vault',
      };
    }
    return { groupId: `system:${type}`, category: 'vault' };
  }

  // Escrow / auction types
  const auctionId =
    (payload?.auctionId as string) ||
    (msg.auctionId as string) ||
    (msg.channel as string);
  if (auctionId) return { groupId: auctionId, category: 'rfq' };

  return null;
}

export function useRelayerMessageLog() {
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const groupsRef = useRef<Map<string, MessageGroup>>(new Map());
  const [tick, setTick] = useState(0);
  const subscribedAuctionsRef = useRef<
    Map<string, { subscribedAt: number; secondary: boolean }>
  >(new Map());

  const clear = useCallback(() => {
    groupsRef.current.clear();
    subscribedAuctionsRef.current.clear();
    setTick((t) => (t + 1) % 1_000_000);
  }, []);

  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    const subscribedAuctions = subscribedAuctionsRef.current;

    // Subscribe to feeds (queued until open by the WS client)
    client.send({ type: 'vault_quote.observe' });
    client.send({ type: 'secondary.feed.subscribe' });

    const offOpen = client.addOpenListener(() => {
      // Only resubscribe to dynamic auction channels on reconnect
      // (vault_quote.observe and secondary.feed.subscribe are sent once on mount)
      for (const [id, entry] of Array.from(subscribedAuctions.entries())) {
        const subType = entry.secondary
          ? 'secondary.auction.subscribe'
          : 'auction.subscribe';
        client.send({ type: subType, payload: { auctionId: id } });
      }
    });

    const offMsg = client.addMessageListener((raw) => {
      try {
        const msg = raw as Record<string, unknown>;
        const now = Date.now();
        const type = String(msg?.type || 'unknown');
        const payload = msg?.payload as Record<string, unknown> | undefined;

        const logged: LoggedMessage = {
          id: crypto.randomUUID(),
          type,
          source: getMessageSource(raw),
          timestamp: now,
          payload: payload ?? msg,
        };

        const groupInfo = extractGroupKey(type, msg);
        const groupId = groupInfo?.groupId ?? `system:${type}`;
        const category: GroupCategory = groupInfo?.category ?? 'rfq';

        const groups = groupsRef.current;
        const existing = groups.get(groupId);
        if (existing) {
          existing.messages.push(logged);
          existing.updatedAt = now;
        } else {
          groups.set(groupId, {
            groupId,
            category,
            messages: [logged],
            createdAt: now,
            updatedAt: now,
          });
        }

        // Prune if over max groups
        if (groups.size > MAX_GROUPS) {
          const sorted = Array.from(groups.entries()).sort(
            ([, a], [, b]) => a.updatedAt - b.updatedAt
          );
          const toRemove = sorted.slice(0, groups.size - MAX_GROUPS);
          for (const [key] of toRemove) groups.delete(key);
        }

        // Auto-subscribe to auctions
        if (type === 'auction.started') {
          const auctionId =
            (payload?.auctionId as string) || (msg.auctionId as string);
          if (auctionId) {
            subscribedAuctions.set(auctionId, {
              subscribedAt: now,
              secondary: false,
            });
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId },
            });
          }
        }

        // Auto-subscribe to secondary auctions
        if (type === 'secondary.auction.started') {
          const auctionId =
            (payload?.auctionId as string) || (msg.auctionId as string);
          if (auctionId) {
            subscribedAuctions.set(auctionId, {
              subscribedAt: now,
              secondary: true,
            });
            client.send({
              type: 'secondary.auction.subscribe',
              payload: { auctionId },
            });
          }
        }

        setTick((t) => (t + 1) % 1_000_000);
      } catch {
        // swallow
      }
    });

    // Prune stale groups and subscriptions
    const pruneTimer = setInterval(() => {
      const cutoff = Date.now() - GROUP_TTL_MS;
      let pruned = false;

      for (const [id, group] of Array.from(groupsRef.current.entries())) {
        if (group.updatedAt < cutoff) {
          groupsRef.current.delete(id);
          pruned = true;
        }
      }

      // Prune stale subscriptions
      const subCutoff = Date.now() - SUBSCRIPTION_TTL_MS;
      for (const [id, entry] of Array.from(subscribedAuctions.entries())) {
        if (entry.subscribedAt < subCutoff) {
          subscribedAuctions.delete(id);
          const unsubType = entry.secondary
            ? 'secondary.auction.unsubscribe'
            : 'auction.unsubscribe';
          client.send({
            type: unsubType,
            payload: { auctionId: id },
          });
        }
      }

      if (pruned) setTick((t) => (t + 1) % 1_000_000);
    }, PRUNE_INTERVAL_MS);

    return () => {
      client.send({ type: 'vault_quote.unobserve' });
      client.send({ type: 'secondary.feed.unsubscribe' });
      subscribedAuctions.clear();
      offMsg();
      offOpen();
      clearInterval(pruneTimer);
    };
  }, [wsUrl]);

  const groups = useMemo(() => {
    void tick;
    return Array.from(groupsRef.current.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }, [tick]);

  return { groups, clear };
}
