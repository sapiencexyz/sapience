'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { decodeAbiParameters, formatEther } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { fetchConditionsByIds } from '~/hooks/graphql/fetchConditionsByIds';
import { SquareStack as SquareStackIcon } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import NumberDisplay from '~/components/shared/NumberDisplay';
import {
  TransactionTimeCell,
  TransactionAmountCell,
  TransactionOwnerCell,
  type UiTransaction,
} from '~/components/markets/DataDrawer/TransactionCells';
import PositionPredictionsList from '~/components/shared/PositionPredictionsList';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionBidsDialog from '~/components/auction/LegacyAuctionBidsDialog';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useRecentPositions } from '~/hooks/graphql/useRecentPositions';
import { formatDistanceToNow } from 'date-fns';
import PicksSummary from '~/components/shared/PicksSummary';
import CountdownCell from '~/components/shared/CountdownCell';
import type { UILeg } from '~/components/positions/LegacyPositionsTable';

const POSITIONS_PAGE_SIZE = 20;

const FeedPageContent: React.FC = () => {
  const chainId = DEFAULT_CHAIN_ID;
  const collateralAssetTicker = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const TAB_VALUES = ['positions', 'auctions', 'vault-quotes'] as const;
  type TabValue = (typeof TAB_VALUES)[number];

  const [tabValue, setTabValue] = useState<TabValue>('positions');
  const [positionsTake, setPositionsTake] = useState(POSITIONS_PAGE_SIZE);

  const { messages } = useAuctionRelayerFeed({
    observeVaultQuotes: tabValue === 'vault-quotes',
  });

  const { data: recentPositions, isLoading: positionsLoading } =
    useRecentPositions({
      take: positionsTake + 1,
      chainId,
    });

  const hasMore = recentPositions.length > positionsTake;
  const displayPositions = hasMore
    ? recentPositions.slice(0, positionsTake)
    : recentPositions;

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
        const d = m.data as Record<string, unknown> | null;
        const vaultAddress = String(d?.vaultAddress ?? '');
        if (!vaultAddress) continue;
        const existing = map.get(vaultAddress);
        const time = Number(m.time);
        let quote = existing?.quote;
        if (m.type === 'vault_quote.update') {
          const v = d?.vaultCollateralPerShare;
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

  // Collect unique conditionIds from auction.started messages for enrichment
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    try {
      for (const m of messages) {
        if (m.type !== 'auction.started') continue;
        const d = m.data as Record<string, unknown> | null;
        const arr = Array.isArray(d?.predictedOutcomes)
          ? (d.predictedOutcomes as string[])
          : [];
        if (arr.length === 0) continue;
        try {
          const decoded = decodeAbiParameters(
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
          );
          const decodedArr = decoded[0] ?? [];
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
    queryKey: ['auctionConditionsByIds', [...conditionIds].sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($where: ConditionWhereInput!) {
          conditions(where: $where, take: 100) {
            id
            shortName
            question
          }
        }
      `;
      return fetchConditionsByIds<{
        id: string;
        shortName?: string | null;
        question?: string | null;
      }>(CONDITIONS_BY_IDS, conditionIds);
    },
  });

  const conditionMap = useMemo(() => {
    return new Map(conditions.map((c) => [c.id, c]));
  }, [conditions]);

  function toUiTx(m: {
    time: number;
    type: string;
    data: unknown;
  }): UiTransaction {
    const createdAt = new Date(m.time).toISOString();
    const d = m.data as Record<string, any> | null;
    if (m.type === 'auction.started') {
      const maker = d?.maker || d?.predictor || '';
      const positionSize = d?.wager || d?.predictorCollateral || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(positionSize || '0'),
        position: { owner: maker },
      } as UiTransaction;
    }
    if (m.type === 'auction.bids') {
      const bids = Array.isArray(d?.bids) ? (d.bids as any[]) : [];
      const top = bids.reduce((best, b) => {
        try {
          // V1 uses makerCollateral, escrow uses counterpartyCollateral
          const cur = BigInt(
            String(b?.makerCollateral ?? b?.counterpartyCollateral ?? '0')
          );
          const bestVal = BigInt(
            String(best?.makerCollateral ?? best?.counterpartyCollateral ?? '0')
          );
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const taker = top?.taker || top?.counterparty || '';
      const makerCollateral = top?.makerCollateral || top?.counterpartyCollateral || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(makerCollateral || '0'),
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

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'positions' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('positions' as TabValue);
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
      : ('positions' as TabValue);
    setTabValue(nextValue);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
      window.history.replaceState(null, '', url);
    }
  };

  function renderPredictionsCell(m: { type: string; data: unknown }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;
      const d = m.data as Record<string, unknown> | null;
      const arr = Array.isArray(d?.predictedOutcomes)
        ? (d.predictedOutcomes as string[])
        : [];
      if (arr.length === 0)
        return <span className="text-muted-foreground">—</span>;
      // Decode first encoded blob: tuple(bytes32 marketId, bool prediction)[]
      const decoded = decodeAbiParameters(
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
      );
      const decodedArr = decoded[0] ?? [];
      const legs = (decodedArr || []).map(
        (o: { marketId: `0x${string}`; prediction: boolean }) => {
          const cond = conditionMap.get(o.marketId);
          return {
            shortName: cond?.shortName ?? undefined,
            question: cond?.question ?? undefined,
            conditionId: o.marketId,
            choice: o.prediction ? ('No' as const) : ('Yes' as const),
          };
        }
      );
      if (legs.length === 0)
        return <span className="text-muted-foreground">—</span>;
      return (
        <PositionPredictionsList
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
    <div className="mt-0 md:mt-0.5 px-3 md:px-6 lg:px-8 pr-4 md:pr-6 lg:pr-6">
      <div className="mx-auto w-full">
        <Tabs
          value={tabValue}
          onValueChange={(v) => handleTabChange(String(v))}
          className="w-full"
        >
          <div className="mt-3 mb-6 lg:mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-medium inline-flex items-center gap-2">
              <SquareStackIcon className="h-5 w-5" aria-hidden="true" />
              <span>Feed</span>
            </h1>
            <div className="flex items-center gap-3 md:gap-4 md:justify-end">
              <SegmentedTabsList>
                <TabsTrigger value="positions">Positions</TabsTrigger>
                <TabsTrigger value="auctions">Auctions</TabsTrigger>
                <TabsTrigger value="vault-quotes">Vault Quotes</TabsTrigger>
              </SegmentedTabsList>
            </div>
          </div>

          <TabsContent value="positions">
            {positionsLoading && displayPositions.length === 0 ? (
              <div className="flex justify-center py-24">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-foreground opacity-80 animate-ping mr-1.5" />
                  <span>Loading positions...</span>
                </span>
              </div>
            ) : displayPositions.length === 0 ? (
              <div className="flex justify-center py-24">
                <span className="text-muted-foreground">
                  No positions found
                </span>
              </div>
            ) : (
              <>
                <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm [&>tbody>tr>td]:align-middle [&>tbody>tr:hover]:bg-muted/50 [&>tbody>tr>td]:text-brand-white">
                      <thead className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
                        <tr>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Created
                          </th>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Predictions
                          </th>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Predictor
                          </th>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Counterparty
                          </th>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Total
                          </th>
                          <th className="px-4 py-3 text-left align-middle font-medium">
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayPositions.map((pos) => {
                          const createdAt = pos.mintedAt * 1000;
                          const timeAgo = formatDistanceToNow(
                            new Date(createdAt),
                            { addSuffix: true }
                          );
                          const legs: UILeg[] = (pos.predictions || []).map(
                            (pred) => ({
                              question:
                                pred.condition?.question || pred.conditionId,
                              choice: pred.outcomeYes ? 'YES' : 'NO',
                              conditionId: pred.conditionId,
                              resolverAddress: pred.condition?.resolver ?? null,
                              categorySlug:
                                pred.condition?.category?.slug ?? null,
                              endTime: pred.condition?.endTime ?? null,
                              settled: pred.condition?.settled,
                              resolvedToYes: pred.condition?.resolvedToYes,
                              source: 'uma' as const,
                            })
                          );
                          const predictorSizeEth = Number(
                            formatEther(BigInt(pos.predictorCollateral || '0'))
                          );
                          const opponentSizeEth = Number(
                            formatEther(
                              BigInt(pos.counterpartyCollateral || '0')
                            )
                          );
                          const totalEth = Number(
                            formatEther(BigInt(pos.totalCollateral || '0'))
                          );
                          const endsAtSec =
                            pos.endsAt ||
                            Math.max(
                              0,
                              ...(pos.predictions || []).map(
                                (o) => o.condition?.endTime || 0
                              )
                            );
                          const endsAtMs = endsAtSec * 1000;
                          const isActive = pos.status === 'active';
                          const predictorWon = pos.predictorWon === true;
                          const opponentWon = pos.predictorWon === false;

                          return (
                            <tr
                              key={pos.id}
                              className="border-b last:border-b-0"
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm">
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Created
                                  </div>
                                  <span className="text-brand-white whitespace-nowrap">
                                    {timeAgo}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm">
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Predictions
                                  </div>
                                  {legs.length > 0 ? (
                                    <PicksSummary
                                      legs={legs}
                                      positionId={pos.predictorNftTokenId}
                                      marketAddress={pos.marketAddress}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div>
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Predictor
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span
                                      className={`inline-flex items-center gap-1.5 text-sm font-mono ${predictorWon ? 'text-green-400' : 'text-brand-white'}`}
                                    >
                                      <EnsAvatar
                                        address={pos.predictor}
                                        className="shrink-0 rounded-sm ring-1 ring-border/50"
                                        width={16}
                                        height={16}
                                      />
                                      <AddressDisplay address={pos.predictor} />
                                    </span>
                                    <span className="whitespace-nowrap tabular-nums text-muted-foreground font-mono text-xs">
                                      <NumberDisplay
                                        value={predictorSizeEth}
                                        className="tabular-nums text-muted-foreground font-mono"
                                      />{' '}
                                      {collateralAssetTicker}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div>
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Counterparty
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span
                                      className={`inline-flex items-center gap-1.5 text-sm font-mono ${opponentWon ? 'text-green-400' : 'text-brand-white'}`}
                                    >
                                      <EnsAvatar
                                        address={pos.counterparty}
                                        className="shrink-0 rounded-sm ring-1 ring-border/50"
                                        width={16}
                                        height={16}
                                      />
                                      <AddressDisplay
                                        address={pos.counterparty}
                                      />
                                    </span>
                                    <span className="whitespace-nowrap tabular-nums text-muted-foreground font-mono text-xs">
                                      <NumberDisplay
                                        value={opponentSizeEth}
                                        className="tabular-nums text-muted-foreground font-mono"
                                      />{' '}
                                      {collateralAssetTicker}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div>
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Total
                                  </div>
                                  <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                                    <NumberDisplay
                                      value={totalEth}
                                      className="tabular-nums text-brand-white font-mono"
                                    />{' '}
                                    <span className="tabular-nums text-brand-white font-mono">
                                      {collateralAssetTicker}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div>
                                  <div className="xl:hidden text-xs text-muted-foreground mb-1">
                                    Result
                                  </div>
                                  {isActive && endsAtMs > Date.now() ? (
                                    <CountdownCell endTime={endsAtSec} />
                                  ) : isActive ? (
                                    <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                                      Pending
                                    </span>
                                  ) : predictorWon ? (
                                    <span className="whitespace-nowrap tabular-nums font-mono uppercase text-green-600 cursor-default">
                                      Predictor won
                                    </span>
                                  ) : opponentWon ? (
                                    <span className="whitespace-nowrap tabular-nums font-mono uppercase text-green-600 cursor-default">
                                      Counterparty won
                                    </span>
                                  ) : (
                                    <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                                      Settled
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                {hasMore && (
                  <div className="flex justify-center mt-4 mb-12">
                    <button
                      type="button"
                      onClick={() =>
                        setPositionsTake((t) => t + POSITIONS_PAGE_SIZE)
                      }
                      className="text-sm font-mono text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer"
                    >
                      Show more
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="auctions">
            {displayMessages.filter((m) => m.type === 'auction.started')
              .length === 0 ? (
              <div className="flex justify-center py-24">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-foreground opacity-80 animate-ping mr-1.5" />
                  <span>Listening for messages...</span>
                </span>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm [&>thead>tr>th:nth-child(2)]:w-[320px] [&>tbody>tr>td:nth-child(2)]:w-[320px] [&>tbody>tr>td]:align-middle [&>tbody>tr:hover]:bg-muted/50 [&>tbody>tr>td]:text-brand-white">
                    <thead className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
                      <tr>
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
                                const d = m.data as Record<string, any> | null;
                                const auctionId =
                                  m.channel ||
                                  (d?.auctionId as string) ||
                                  (d?.payload?.auctionId as string) ||
                                  null;
                                return (
                                  <AuctionBidsDialog
                                    auctionId={auctionId}
                                    makerCollateral={String(d?.wager ?? '0')}
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
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-foreground opacity-80 animate-ping mr-1.5" />
                  <span>Listening for messages...</span>
                </span>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm [&>thead>tr>th:nth-child(2)]:w-[320px] [&>tbody>tr>td:nth-child(2)]:w-[320px] [&>tbody>tr>td]:align-middle [&>tbody>tr:hover]:bg-muted/50 [&>tbody>tr>td]:text-brand-white">
                    <thead className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
                      <tr>
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
                                className="[&_span.font-mono]:text-brand-white"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.quote != null ? (
                              <span className="whitespace-nowrap inline-flex items-center gap-1">
                                <NumberDisplay
                                  value={Number(row.quote)}
                                  decimals={6}
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

export default FeedPageContent;
