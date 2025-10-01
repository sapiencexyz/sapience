'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { graphqlRequest } from '@sapience/ui/lib';
import type { Transaction as TransactionType } from '@sapience/ui/types';
import { Input } from '@sapience/ui/components/ui/input';
import { Button } from '@sapience/ui/components/ui/button';
import { Zap, Search, SquareStack as SquareStackIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import CombinedFeedTable from './CombinedFeedTable';
import type { FeedRow } from './FeedTable';
import {
  TransactionRow,
  MintParlayNFTTransactionRow,
  BurnParlayNFTTransactionRow,
  type UiTransaction,
} from '~/components/markets/DataDrawer/TransactionCells';
import LoaderWithMessage from '~/components/shared/LoaderWithMessage';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import AddressFilter from '~/components/shared/AddressFilter';
import SplineTopBackground from '~/components/shared/SplineTopBackground';

type FeedTransaction = Pick<
  TransactionType,
  'id' | 'type' | 'createdAt' | 'collateral'
> & {
  collateralTransfer?: { collateral?: string | null } | null;
  event?: { transactionHash?: string | null; logData?: any } | null;
  position?: {
    owner?: string | null;
    positionId?: string | number | null;
    isLP?: boolean | null;
    market?: {
      optionName?: string | null;
      marketId?: string | number | null;
      marketGroup?: {
        chainId?: number | null;
        address?: string | null;
        collateralSymbol?: string | null;
        collateralDecimals?: number | null;
        question?: string | null;
      } | null;
    } | null;
  } | null;
};

const FEED_QUERY = /* GraphQL */ `
  query FeedTransactions($take: Int!) {
    transactions(orderBy: { createdAt: desc }, take: $take) {
      id
      type
      createdAt
      collateral
      collateralTransfer {
        collateral
      }
      event {
        transactionHash
        logData
      }
      position {
        owner
        positionId
        isLP
        market {
          question
          optionName
          marketId
          marketGroup {
            chainId
            address
            collateralSymbol
            collateralDecimals
            question
          }
        }
      }
    }
  }
`;

function pickRowComponent(tx: UiTransaction) {
  const t = (tx.type || '').toLowerCase();
  if (
    t === 'mintparlaynfts' ||
    t === 'mintparlaynft' ||
    t === 'mint_parlay_nfts'
  ) {
    return MintParlayNFTTransactionRow;
  }
  if (
    t === 'burnparlaynfts' ||
    t === 'burnparlaynft' ||
    t === 'burn_parlay_nfts'
  ) {
    return BurnParlayNFTTransactionRow;
  }
  return TransactionRow;
}

type PredictedOutcome = {
  conditionId: string;
  prediction: boolean;
  condition?: {
    shortName?: string | null;
    question?: string | null;
    endTime?: number | null;
  } | null;
};

export default function FeedPage() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [firstLoadComplete, setFirstLoadComplete] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const { data: forecastsData = [], isLoading: forecastsLoading } =
    useForecasts({});

  // Min amount filter (token units)
  const [minAmountInput, setMinAmountInput] = useState<string>('');
  const minAmount = useMemo(() => {
    const parsed = parseFloat(minAmountInput);
    return Number.isFinite(parsed) ? parsed : null;
  }, [minAmountInput]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [address, setAddress] = useState<string | null>(null);

  // Try to infer a primary collateral symbol from loaded rows
  const primaryCollateralSymbol = useMemo(() => {
    for (const r of rows) {
      const sym = (r as any)?.collateralAssetTicker;
      if (typeof sym === 'string' && sym.trim()) return sym;
    }
    return 'testUSDe';
  }, [rows]);

  const buildRows = useCallback(
    (
      transactions: FeedTransaction[],
      parlayPredictionsByKey: Map<string, PredictedOutcome[]>
    ) => {
      const built: FeedRow[] = transactions.flatMap<FeedRow>((tx) => {
        const collateralAssetTicker =
          tx.position?.market?.marketGroup?.collateralSymbol || null;
        const mg = tx.position?.market?.marketGroup as any;
        let sortedMarketsForColors: any[] = [];
        if (mg?.markets && Array.isArray(mg.markets)) {
          sortedMarketsForColors = [...mg.markets].sort(
            (a: any, b: any) =>
              Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
          );
        } else {
          const cur = tx.position?.market;
          if (cur) sortedMarketsForColors = [cur];
        }
        const lowerType = String(tx.type || '').toLowerCase();
        const isMintParlay =
          lowerType === 'mintparlaynfts' ||
          lowerType === 'mintparlaynft' ||
          lowerType === 'mint_parlay_nfts';
        if (!isMintParlay) {
          const Comp = pickRowComponent(tx as unknown as UiTransaction);
          return [
            {
              Comp,
              key: tx.id,
              tx: tx as unknown as UiTransaction,
              collateralAssetTicker,
              sortedMarketsForColors,
            } as FeedRow,
          ];
        }
        const logData: any = (tx as any)?.event?.logData || {};
        const maker =
          typeof logData?.maker === 'string' ? logData.maker : undefined;
        const taker =
          typeof logData?.taker === 'string' ? logData.taker : undefined;
        const makerNftTokenId = logData?.makerNftTokenId;
        const takerNftTokenId = logData?.takerNftTokenId;
        const makerCollateral = logData?.makerCollateral;
        const takerCollateral = logData?.takerCollateral;
        const parlayKey = `${String(makerNftTokenId ?? '')}-${String(takerNftTokenId ?? '')}`;
        const enrichedOutcomes = (() => {
          const evOutcomes: PredictedOutcome[] | undefined = Array.isArray(
            logData?.predictedOutcomes
          )
            ? (logData.predictedOutcomes as PredictedOutcome[])
            : undefined;
          if (evOutcomes && evOutcomes.length > 0) return evOutcomes;
          const fromUserParlays = parlayPredictionsByKey.get(parlayKey);
          return fromUserParlays && fromUserParlays.length > 0
            ? fromUserParlays
            : undefined;
        })();
        const Comp = MintParlayNFTTransactionRow;
        const makerTx: UiTransaction = {
          ...(tx as any),
          type: 'Parlay',
          position: {
            ...(tx as any)?.position,
            owner: maker || (tx as any)?.position?.owner || null,
            positionId:
              makerNftTokenId ?? (tx as any)?.position?.positionId ?? null,
            collateral:
              makerCollateral ?? (tx as any)?.position?.collateral ?? null,
          },
          event: {
            ...(tx as any)?.event,
            logData: {
              ...(tx as any)?.event?.logData,
              ...(enrichedOutcomes
                ? { predictedOutcomes: enrichedOutcomes }
                : {}),
            },
          },
        } as UiTransaction;
        const takerTx: UiTransaction = {
          ...(tx as any),
          type: 'Anti-Parlay',
          position: {
            ...(tx as any)?.position,
            owner: taker || (tx as any)?.position?.owner || null,
            positionId:
              takerNftTokenId ?? (tx as any)?.position?.positionId ?? null,
            collateral:
              takerCollateral ?? (tx as any)?.position?.collateral ?? null,
          },
          event: {
            ...(tx as any)?.event,
            logData: {
              ...(tx as any)?.event?.logData,
              ...(enrichedOutcomes
                ? { predictedOutcomes: enrichedOutcomes }
                : {}),
            },
          },
        } as UiTransaction;
        return [
          {
            Comp,
            key: `${tx.id}-maker`,
            tx: makerTx,
            collateralAssetTicker: 'testUSDe',
            sortedMarketsForColors,
          } as FeedRow,
          {
            Comp,
            key: `${tx.id}-taker`,
            tx: takerTx,
            collateralAssetTicker: 'testUSDe',
            sortedMarketsForColors,
          } as FeedRow,
        ];
      });
      return built;
    },
    []
  );

  const fetchAndBuild = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await graphqlRequest<{ transactions: FeedTransaction[] }>(
        FEED_QUERY,
        { take: 100 }
      );
      const transactions = res.transactions || [];

      const makerSet = new Set<string>();
      for (const tx of transactions) {
        const t = String(tx.type || '').toLowerCase();
        if (
          t === 'mintparlaynfts' ||
          t === 'mintparlaynft' ||
          t === 'mint_parlay_nfts'
        ) {
          const maker = (tx as any)?.event?.logData?.maker;
          if (maker && typeof maker === 'string')
            makerSet.add(maker.toLowerCase());
        }
      }

      const USER_PARLAYS_QUERY = /* GraphQL */ `
        query UserParlays($address: String!, $take: Int, $skip: Int) {
          userParlays(address: $address, take: $take, skip: $skip) {
            makerNftTokenId
            takerNftTokenId
            predictedOutcomes {
              conditionId
              prediction
              condition {
                shortName
                question
                endTime
              }
            }
          }
        }
      `;

      const parlayPredictionsByKey = new Map<string, PredictedOutcome[]>();
      const makerArr = Array.from(makerSet);
      if (makerArr.length > 0) {
        const parlayLists = await Promise.all(
          makerArr.map((address) =>
            graphqlRequest<{
              userParlays: Array<{
                makerNftTokenId: string;
                takerNftTokenId: string;
                predictedOutcomes: PredictedOutcome[];
              }>;
            }>(USER_PARLAYS_QUERY, { address, take: 100, skip: 0 }).catch(
              () => ({ userParlays: [] })
            )
          )
        );
        for (const res of parlayLists) {
          const list = res?.userParlays || [];
          for (const p of list) {
            const key = `${String(p.makerNftTokenId)}-${String(p.takerNftTokenId)}`;
            if (!parlayPredictionsByKey.has(key))
              parlayPredictionsByKey.set(key, p.predictedOutcomes || []);
          }
        }
      }

      const built = buildRows(transactions, parlayPredictionsByKey);
      setRows(built);
      if (!firstLoadComplete) setFirstLoadComplete(true);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to load transactions.');
    }
  }, [buildRows, firstLoadComplete]);

  useEffect(() => {
    fetchAndBuild();
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(fetchAndBuild, 5000);
    return () => {
      if (intervalRef.current != null)
        window.clearInterval(intervalRef.current);
    };
  }, [fetchAndBuild]);

  const initialLoaded = firstLoadComplete && !forecastsLoading;

  if (!initialLoaded) {
    return (
      <div className="relative min-h-screen">
        <SplineTopBackground />
        <div className="my-20 pt-1 px-3 md:px-6 lg:px-8 pr-4 md:pr-6 lg:pr-6 relative">
          <div className="mx-auto w-full">
            {errorMessage ? (
              <div className="px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
            <div className="mt-3 mb-6 xl:mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-end justify-between">
                <h1 className="text-xl font-medium inline-flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <Zap className="h-5 w-5" aria-hidden="true" />
                  <span className="whitespace-nowrap">Live Activity Feed</span>
                </h1>
                <Link href="/auction" className="xl:hidden">
                  <Button
                    variant="default"
                    size="xs"
                    className="h-7 px-2 text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-2 lg:h-8 lg:px-3 lg:text-sm"
                  >
                    <SquareStackIcon className="h-4 w-4" />
                    Parlay Auction
                  </Button>
                </Link>
              </div>
              <div className="flex items-end w-full xl:flex-1 min-w-0 gap-2 xl:gap-4 xl:justify-end">
                <div className="grid grid-cols-1 gap-2 xl:gap-4 xl:grid-cols-3 xl:items-end w-full xl:max-w-[800px] min-w-0">
                  <div className="px-0 lg:px-2 block xl:hidden text-xs text-muted-foreground">
                    Filters
                  </div>
                  <div className="px-0 lg:px-0">
                    <div className="relative">
                      <Image
                        src="/usde.svg"
                        alt="USDe"
                        width={20}
                        height={20}
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 z-10 opacity-90 pointer-events-none"
                      />
                      <Input
                        inputMode="decimal"
                        type="text"
                        placeholder="Minimum amount"
                        value={minAmountInput}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = v.split('.');
                          const cleaned =
                            parts.length > 2
                              ? `${parts[0]}.${parts.slice(1).join('')}`
                              : v;
                          setMinAmountInput(cleaned);
                        }}
                        className="h-8 text-sm pr-20 pl-8 w-full"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
                        {primaryCollateralSymbol}
                      </span>
                    </div>
                  </div>
                  <div className="px-0 lg:px-0">
                    <div className="relative">
                      <Search
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none"
                        aria-hidden="true"
                      />
                      <Input
                        placeholder="Search questions and positions"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-sm w-full pl-8"
                      />
                    </div>
                  </div>
                  <AddressFilter
                    selectedAddress={address}
                    onAddressChange={setAddress}
                    placeholder="Filter by address or ENS"
                    className="px-0 lg:pl-0 lg:pr-0"
                    inputClassName="h-8 text-sm w-full"
                  />
                </div>
                <Link href="/auction" className="hidden xl:block">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 whitespace-nowrap"
                  >
                    <SquareStackIcon className="h-4 w-4" />
                    Parlay Auction
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-center py-24">
              <LoaderWithMessage
                width={32}
                height={32}
                message="Querying recent activity..."
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <SplineTopBackground />
      <div className="my-20 pt-1 px-3 md:px-6 lg:px-8 pr-4 md:pr-6 lg:pr-6 relative">
        <div className="mx-auto w-full">
          <div className="mt-3 mb-6 xl:mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-end justify-between">
              <h1 className="text-xl font-medium inline-flex items-center gap-2 shrink-0 whitespace-nowrap">
                <Zap className="h-5 w-5" aria-hidden="true" />
                <span className="whitespace-nowrap">Live Activity Feed</span>
              </h1>
              <Link href="/auction" className="xl:hidden">
                <Button
                  variant="default"
                  size="xs"
                  className="h-7 px-2 text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-2 lg:h-8 lg:px-3 lg:text-sm"
                >
                  <SquareStackIcon className="h-4 w-4" />
                  Parlay Auction
                </Button>
              </Link>
            </div>
            <div className="flex items-end w-full xl:flex-1 min-w-0 gap-2 xl:gap-4 xl:justify-end">
              <div className="grid grid-cols-1 gap-2 xl:gap-4 xl:grid-cols-3 xl:items-end w-full xl:max-w-[800px] min-w-0">
                <div className="px-0 lg:px-2 block xl:hidden text-xs text-muted-foreground">
                  Filters
                </div>
                <div className="px-0 lg:px-0">
                  <div className="relative">
                    <Image
                      src="/usde.svg"
                      alt="USDe"
                      width={20}
                      height={20}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 z-10 opacity-90 pointer-events-none"
                    />
                    <Input
                      inputMode="decimal"
                      type="text"
                      placeholder="Minimum amount"
                      value={minAmountInput}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '');
                        const parts = v.split('.');
                        const cleaned =
                          parts.length > 2
                            ? `${parts[0]}.${parts.slice(1).join('')}`
                            : v;
                        setMinAmountInput(cleaned);
                      }}
                      className="h-8 text-sm pr-20 pl-8 w-full"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
                      {primaryCollateralSymbol}
                    </span>
                  </div>
                </div>
                <div className="px-0 lg:px-0">
                  <div className="relative">
                    <Search
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none"
                      aria-hidden="true"
                    />
                    <Input
                      placeholder="Search questions and positions"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 text-sm w-full pl-8"
                    />
                  </div>
                </div>
                <AddressFilter
                  selectedAddress={address}
                  onAddressChange={setAddress}
                  placeholder="Filter by address or ENS"
                  className="px-0 lg:pl-0 lg:pr-0"
                  inputClassName="h-8 text-sm w-full"
                />
              </div>
              <Link href="/auction" className="hidden xl:block">
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 whitespace-nowrap"
                >
                  <SquareStackIcon className="h-4 w-4" />
                  Parlay Auction
                </Button>
              </Link>
            </div>
          </div>
          <div className="rounded border bg-card">
            {errorMessage ? (
              <div className="px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
            <CombinedFeedTable
              rows={rows}
              forecasts={forecastsData}
              minAmount={minAmount ?? undefined}
              searchQuery={searchQuery}
              address={address}
            />
            {initialLoaded && rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                No transactions found.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
