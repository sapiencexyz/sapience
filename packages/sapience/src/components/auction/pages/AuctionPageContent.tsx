'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { decodeAbiParameters } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';
import { SquareStack as SquareStackIcon, Zap } from 'lucide-react';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import Link from 'next/link';
import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import LoaderWithMessage from '~/components/shared/LoaderWithMessage';
import {
  TransactionTimeCell,
  TransactionAmountCell,
  TransactionOwnerCell,
  type UiTransaction,
} from '~/components/markets/DataDrawer/TransactionCells';
import ParlayLegsList from '~/components/shared/ParlayLegsList';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionBidsDialog from '~/components/auction/AuctionBidsDialog';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';

const AuctionPageContent: React.FC = () => {
  const TAB_VALUES = ['auctions', 'vault-quotes'] as const;
  type TabValue = (typeof TAB_VALUES)[number];

  const [tabValue, setTabValue] = useState<TabValue>('auctions');

  const { messages } = useAuctionRelayerFeed({
    observeVaultQuotes: tabValue === 'vault-quotes',
  });

  // Display real server broadcasts only; sort by time desc
  const displayMessages = useMemo(() => {
    return [...messages].sort((a, b) => Number(b.time) - Number(a.time));
  }, [messages]);

  // Group vault quote messages by vaultAddress so a single row updates from Pending → Value
  const vaultQuoteRows = useMemo(() => {
    try {
      const relevant = displayMessages.filter(
        (m) =>
          m.type === 'vault_quote.requested' || m.type === 'vault_quote.update'
      );
      const map = new Map<
        string,
        { vaultAddress: string; time: number; quote?: string }
      >();
      for (const m of relevant) {
        const vaultAddress = String((m as any)?.data?.vaultAddress ?? '');
        if (!vaultAddress) continue;
        const existing = map.get(vaultAddress);
        const time = Number(m.time);
        let quote = existing?.quote;
        if (m.type === 'vault_quote.update') {
          const v = (m as any)?.data?.vaultCollateralPerShare;
          if (v != null) quote = String(v);
        }
        const latestTime = existing ? Math.max(existing.time, time) : time;
        map.set(vaultAddress, { vaultAddress, time: latestTime, quote });
      }
      return Array.from(map.values()).sort((a, b) => b.time - a.time);
    } catch {
      return [] as Array<{
        vaultAddress: string;
        time: number;
        quote?: string;
      }>;
    }
  }, [displayMessages]);

  // Removed ray-to-decimal formatting; relayer now sends decimal strings

  // Collect unique conditionIds from auction.started messages for enrichment
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    try {
      for (const m of messages) {
        if (m.type !== 'auction.started') continue;
        const arr = Array.isArray((m.data as any)?.predictedOutcomes)
          ? ((m.data as any).predictedOutcomes as string[])
          : [];
        if (arr.length === 0) continue;
        try {
          const decodedUnknown = decodeAbiParameters(
            [
              {
                type: 'tuple[]',
                components: [
                  { name: 'marketId', type: 'bytes32' },
                  { name: 'prediction', type: 'bool' },
                ],
              },
            ] as const,
            arr[0] as `0x${string}`
          ) as unknown;
          const decodedArr = Array.isArray(decodedUnknown)
            ? (decodedUnknown as any)[0]
            : [];
          for (const o of decodedArr || []) {
            const id = o?.marketId as string | undefined;
            if (id && typeof id === 'string') set.add(id);
          }
        } catch {
          console.error('Error decoding predicted outcomes', m.data);
        }
      }
    } catch {
      console.error('Error collecting condition ids');
    }
    return Array.from(set);
  }, [messages]);

  // Query conditions to enrich shortName/question for decoded predicted outcomes
  const { data: conditions = [] } = useQuery<
    { id: string; shortName?: string | null; question?: string | null }[],
    Error
  >({
    queryKey: ['auctionConditionsByIds', conditionIds.sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            shortName
            question
          }
        }
      `;
      const resp = await graphqlRequest<{
        conditions: Array<{
          id: string;
          shortName?: string | null;
          question?: string | null;
        }>;
      }>(CONDITIONS_BY_IDS, { ids: conditionIds });
      return resp?.conditions || [];
    },
  });

  const conditionMap = useMemo(() => {
    return new Map(conditions.map((c) => [c.id, c]));
  }, [conditions]);

  // Note: bids are shown per auction via `AuctionBidsDialog` which fetches its own live data on demand.

  function toUiTx(m: { time: number; type: string; data: any }): UiTransaction {
    const createdAt = new Date(m.time).toISOString();
    if (m.type === 'auction.started') {
      const maker = m.data?.maker || '';
      const wager = m.data?.wager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(wager || '0'),
        position: { owner: maker },
      } as UiTransaction;
    }
    if (m.type === 'auction.bids') {
      const bids = Array.isArray(m.data?.bids) ? (m.data.bids as any[]) : [];
      const top = bids.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.takerWager ?? '0'));
          const bestVal = BigInt(String(best?.takerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const taker = top?.taker || '';
      const takerWager = top?.takerWager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(takerWager || '0'),
        position: { owner: taker },
      } as UiTransaction;
    }
    return {
      id: m.time,
      type: 'FORECAST',
      createdAt,
      collateral: '0',
      position: { owner: '' },
    } as UiTransaction;
  }

  const collateralAssetTicker = 'testUSDe';

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'auctions' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('auctions' as TabValue);
    return desired;
  };

  useEffect(() => {
    setTabValue(getHashValue());
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setTabValue(getHashValue());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    };
  }, []);

  const handleTabChange = (value: string) => {
    const nextValue = (TAB_VALUES as readonly string[]).includes(value)
      ? (value as TabValue)
      : ('auctions' as TabValue);
    setTabValue(nextValue);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
      window.history.replaceState(null, '', url);
    }
  };

  function renderPredictionsCell(m: { type: string; data: any }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;
      const arr = Array.isArray(m.data?.predictedOutcomes)
        ? (m.data.predictedOutcomes as string[])
        : [];
      if (arr.length === 0)
        return <span className="text-muted-foreground">—</span>;
      // Decode first encoded blob: tuple(bytes32 marketId, bool prediction)[]
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'marketId', type: 'bytes32' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        arr[0] as `0x${string}`
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? (decodedUnknown as any)[0]
        : [];
      const legs = (decodedArr || []).map(
        (o: { marketId: `0x${string}`; prediction: boolean }) => {
          const cond = conditionMap.get(o.marketId);
          return {
            shortName: cond?.shortName ?? undefined,
            question: cond?.question ?? undefined,
            conditionId: o.marketId,
            choice: o.prediction ? ('Yes' as const) : ('No' as const),
          };
        }
      );
      if (legs.length === 0)
        return <span className="text-muted-foreground">—</span>;
      return (
        <ParlayLegsList
          legs={legs}
          layout="row"
          maxWidthClass="max-w-[320px]"
        />
      );
    } catch {
      return <span className="text-muted-foreground">—</span>;
    }
  }

  return (
    <div className="my-20 pt-1 px-3 md:px-6 lg:px-8 pr-4 md:pr-6 lg:pr-6">
      <div className="mx-auto w-full">
        <Tabs
          value={tabValue}
          onValueChange={(v) => handleTabChange(String(v))}
          className="w-full"
        >
          <div className="mt-3 mb-6 lg:mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-medium inline-flex items-center gap-2">
              <SquareStackIcon className="h-5 w-5" aria-hidden="true" />
              <span>Parlay Auction Feed</span>
            </h1>
            <div className="flex items-center gap-3 md:gap-4 md:justify-end">
              <TabsList size="sm">
                <TabsTrigger size="sm" value="auctions">
                  Parlay Auctions
                </TabsTrigger>
                <TabsTrigger size="sm" value="vault-quotes">
                  Vault Quotes
                </TabsTrigger>
              </TabsList>
              <Link href="/feed">
                <Button
                  variant="default"
                  size="xs"
                  className="h-7 px-2 text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-2 lg:h-8 lg:px-3 lg:text-sm"
                >
                  <Zap className="h-4 w-4" />
                  Live Activity
                </Button>
              </Link>
            </div>
          </div>

          <TabsContent value="auctions">
            {displayMessages.filter((m) => m.type === 'auction.started')
              .length === 0 ? (
              <div className="flex justify-center py-24">
                <LoaderWithMessage
                  width={32}
                  height={32}
                  message="Listening for messages..."
                />
              </div>
            ) : (
              <div className="rounded border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm [&>thead>tr>th:nth-child(2)]:w-[320px] [&>tbody>tr>td:nth-child(2)]:w-[320px] [&>tbody>tr>td]:align-middle">
                    <thead className="bg-muted/30 text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Time
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Predictions
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Verifier
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Address
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayMessages
                        .filter((m) => m.type === 'auction.started')
                        .map((m, idx) => (
                          <tr
                            key={`started-${idx}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <TransactionTimeCell tx={toUiTx(m)} />
                            </td>
                            <td className="px-4 py-3">
                              {renderPredictionsCell(m)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <img
                                src="/uma.svg"
                                alt="UMA"
                                className="h-3 w-auto"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <TransactionAmountCell
                                tx={toUiTx(m)}
                                collateralAssetTicker={collateralAssetTicker}
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <TransactionOwnerCell tx={toUiTx(m)} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              {(() => {
                                const auctionId =
                                  (m as any)?.channel ||
                                  ((m as any)?.data?.auctionId as string) ||
                                  ((m as any)?.data?.payload
                                    ?.auctionId as string) ||
                                  ((m as any)?.auctionId as string) ||
                                  null;
                                return (
                                  <AuctionBidsDialog
                                    auctionId={auctionId}
                                    makerWager={String(
                                      (m as any)?.data?.wager ?? '0'
                                    )}
                                    collateralAssetTicker={
                                      collateralAssetTicker
                                    }
                                  />
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vault-quotes">
            {displayMessages.filter(
              (m) =>
                m.type === 'vault_quote.requested' ||
                m.type === 'vault_quote.update'
            ).length === 0 ? (
              <div className="flex justify-center py-24">
                <LoaderWithMessage
                  width={32}
                  height={32}
                  message="Listening for messages..."
                />
              </div>
            ) : (
              <div className="rounded border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm [&>thead>tr>th:nth-child(2)]:w-[320px] [&>tbody>tr>td:nth-child(2)]:w-[320px] [&>tbody>tr>td]:align-middle">
                    <thead className="bg-muted/30 text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Time
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Vault
                        </th>
                        <th className="px-4 py-3 text-left align-middle font-medium">
                          Share Value Quote
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaultQuoteRows.map((row) => (
                        <tr
                          key={row.vaultAddress}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <TransactionTimeCell
                              tx={toUiTx({
                                time: row.time,
                                type: 'vault_quote.update',
                                data: {},
                              })}
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {row.vaultAddress ? (
                                <EnsAvatar
                                  address={row.vaultAddress}
                                  width={16}
                                  height={16}
                                />
                              ) : null}
                              <AddressDisplay
                                address={row.vaultAddress}
                                compact
                                disablePopover
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.quote != null ? (
                              <span className="whitespace-nowrap inline-flex items-center gap-1">
                                <NumberDisplay
                                  value={row.quote}
                                  precision={6}
                                />{' '}
                                {collateralAssetTicker} per share
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Pending…
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AuctionPageContent;
