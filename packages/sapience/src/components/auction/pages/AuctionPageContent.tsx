'use client';

import type React from 'react';
import { useMemo } from 'react';
import { decodeAbiParameters } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';
import { SquareStack as SquareStackIcon, Zap } from 'lucide-react';
import { Button } from '@sapience/ui/components/ui/button';
import Link from 'next/link';
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

const AuctionPageContent: React.FC = () => {
  const { messages } = useAuctionRelayerFeed();

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
        <div className="mt-3 mb-6 lg:mb-4 flex items-end justify-between">
          <h1 className="text-xl font-medium inline-flex items-center gap-2">
            <SquareStackIcon className="h-5 w-5" aria-hidden="true" />
            <span>Parlay Auction Feed</span>
          </h1>
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

        {messages.length === 0 ? (
          <LoaderWithMessage
            width={32}
            height={32}
            message="Listening for auctions..."
            className="min-h-[calc(100dvh-16rem)] py-12"
          />
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
                  {messages.map((m, idx) => {
                    const isStarted = m.type === 'auction.started';
                    const isBids = m.type === 'auction.bids';
                    if (isBids) return null;
                    return (
                      <tr key={idx} className="border-b">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <TransactionTimeCell tx={toUiTx(m)} />
                        </td>
                        {isStarted ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3" colSpan={5}>
                              <pre className="text-xs whitespace-pre-wrap break-words">
                                {JSON.stringify(m.data ?? m, null, 2) ?? '—'}
                              </pre>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuctionPageContent;
