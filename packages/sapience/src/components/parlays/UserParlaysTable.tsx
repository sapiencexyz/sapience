'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
const ZERO_REF_CODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, HelpCircle } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@sapience/ui/components/ui/badge';
import { useReadContracts, useAccount } from 'wagmi';
import type { Abi } from 'abitype';
import PredictionMarket from '@/protocol/deployments/PredictionMarket.json';
// Minimal ABI for PredictionMarketUmaResolver.resolvePrediction(bytes)
const UMA_RESOLVER_MIN_ABI = [
  {
    type: 'function',
    name: 'resolvePrediction',
    stateMutability: 'view',
    inputs: [{ name: 'encodedPredictedOutcomes', type: 'bytes' }],
    outputs: [
      { name: 'isValid', type: 'bool' },
      { name: 'error', type: 'uint8' },
      { name: 'makerWon', type: 'bool' },
    ],
  },
] as const;
import { useQueryClient } from '@tanstack/react-query';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import ParlayLegsList from '~/components/shared/ParlayLegsList';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { usePredictionMarketWriteContract } from '~/hooks/blockchain/usePredictionMarketWriteContract';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import NumberDisplay from '~/components/shared/NumberDisplay';
import ShareDialog from '~/components/shared/ShareDialog';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import AwaitingSettlementBadge from '~/components/shared/AwaitingSettlementBadge';

function EndsInButton({ endsAtMs }: { endsAtMs: number }) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const isPast = endsAtMs <= nowMs;
  if (isPast) {
    return <AwaitingSettlementBadge />;
  }
  const msLeft = Math.max(0, endsAtMs - nowMs);
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const label =
    daysLeft >= 1 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}` : '<1 day';
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="whitespace-nowrap"
      disabled
    >
      {`Settles in ${label}`}
    </Button>
  );
}

export default function UserParlaysTable({
  account,
  showHeaderText = true,
}: {
  account: Address;
  showHeaderText?: boolean;
}) {
  // ---
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useAccount();
  const hasWallet = Boolean(connectedAddress);
  const { burn, isPending: isClaimPending } = usePredictionMarketWriteContract({
    successMessage: 'Claim submitted',
    fallbackErrorMessage: 'Claim failed',
    onSuccess: () => {
      const addr = String(account || '').toLowerCase();
      queryClient
        .invalidateQueries({ queryKey: ['userParlays', addr] })
        .catch(() => {});
    },
  });
  type UILeg = { question: string; choice: 'Yes' | 'No' };
  type UIParlay = {
    positionId: number;
    legs: UILeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // ms
    status: 'active' | 'won' | 'lost';
    tokenIdToClaim?: bigint;
    createdAt: number; // ms
    totalPayoutWei: bigint; // total payout if won
    makerCollateralWei?: bigint; // user's wager if they are maker
    takerCollateralWei?: bigint; // user's wager if they are taker
    userPnL: string; // pnl for settled parlays
    addressRole: 'maker' | 'taker' | 'unknown';
    counterpartyAddress?: Address | null;
    chainId: number;
    marketAddress: Address;
  };

  // Fetch real data
  const { data } = useUserParlays({ address: String(account) });
  // ---

  const viewer = React.useMemo(
    () => String(account || '').toLowerCase(),
    [account]
  );
  const rows: UIParlay[] = React.useMemo(() => {
    const parlayRows = (data || []).map((p: any) => {
      const legs: UILeg[] = (p.predictedOutcomes || []).map((o: any) => ({
        question:
          o?.condition?.shortName || o?.condition?.question || o.conditionId,
        choice: o.prediction ? 'Yes' : 'No',
      }));
      const endsAtSec =
        p.endsAt ||
        Math.max(
          0,
          ...(p.predictedOutcomes || []).map(
            (o: any) => o?.condition?.endTime || 0
          )
        );
      const userIsMaker =
        typeof p.maker === 'string' && p.maker.toLowerCase() === viewer;
      const userIsTaker =
        typeof p.taker === 'string' && p.taker.toLowerCase() === viewer;
      const isActive = p.status === 'active';
      const userWon =
        !isActive &&
        ((userIsMaker && p.makerWon === true) ||
          (userIsTaker && p.makerWon === false));
      const status: UIParlay['status'] = isActive
        ? 'active'
        : userWon
          ? 'won'
          : 'lost';
      const tokenIdToClaim = userWon
        ? userIsMaker
          ? BigInt(p.makerNftTokenId)
          : BigInt(p.takerNftTokenId)
        : undefined;

      // Calculate PnL for settled parlays
      let userPnL = '0';
      if (
        !isActive &&
        p.makerCollateral &&
        p.takerCollateral &&
        p.totalCollateral
      ) {
        try {
          const makerCollateral = BigInt(p.makerCollateral);
          const takerCollateral = BigInt(p.takerCollateral);
          const totalCollateral = BigInt(p.totalCollateral);

          if (userIsMaker) {
            if (p.makerWon) {
              // Maker won: profit = totalCollateral - makerCollateral
              userPnL = (totalCollateral - makerCollateral).toString();
            } else {
              // Maker lost: loss = -makerCollateral
              userPnL = (-makerCollateral).toString();
            }
          } else if (userIsTaker) {
            if (!p.makerWon) {
              // Taker won: profit = totalCollateral - takerCollateral
              userPnL = (totalCollateral - takerCollateral).toString();
            } else {
              // Taker lost: loss = -takerCollateral
              userPnL = (-takerCollateral).toString();
            }
          }
        } catch (e) {
          console.error('Error calculating parlay PnL:', e);
        }
      }

      // Choose positionId based on the profile address' role
      const positionId = userIsMaker
        ? Number(p.makerNftTokenId)
        : userIsTaker
          ? Number(p.takerNftTokenId)
          : p.makerNftTokenId
            ? Number(p.makerNftTokenId)
            : p.id;
      // Choose wager based on the profile address' role
      const viewerMakerCollateralWei = (() => {
        try {
          return p.makerCollateral ? BigInt(p.makerCollateral) : undefined;
        } catch {
          return undefined;
        }
      })();
      const viewerTakerCollateralWei = (() => {
        try {
          return p.takerCollateral ? BigInt(p.takerCollateral) : undefined;
        } catch {
          return undefined;
        }
      })();
      return {
        positionId,
        legs,
        direction: 'Long' as const,
        endsAt: endsAtSec ? endsAtSec * 1000 : Date.now(),
        status,
        tokenIdToClaim,
        createdAt: p.mintedAt ? Number(p.mintedAt) * 1000 : Date.now(),
        totalPayoutWei: (() => {
          try {
            return BigInt(p.totalCollateral || '0');
          } catch {
            return 0n;
          }
        })(),
        makerCollateralWei: viewerMakerCollateralWei,
        takerCollateralWei: viewerTakerCollateralWei,
        userPnL,
        addressRole: userIsMaker
          ? ('maker' as const)
          : userIsTaker
            ? ('taker' as const)
            : ('unknown' as const),
        counterpartyAddress:
          (userIsMaker
            ? (p.taker as Address | undefined)
            : userIsTaker
              ? (p.maker as Address | undefined)
              : undefined) ?? null,
        chainId: Number(p.chainId || 42161),
        marketAddress: (p.marketAddress ||
          '0x8D1D1946cBc56F695584761d25D13F174906671C') as Address,
      };
    });

    return parlayRows;
  }, [data, viewer]);
  // Detect claimability by checking on-chain ownerOf for the potential claim tokenIds
  const tokenIdsToCheck = React.useMemo(
    () =>
      rows
        .filter((r) => r.status === 'won' && r.tokenIdToClaim !== undefined)
        .map((r) => r.tokenIdToClaim!),
    [rows]
  );
  const ownerReads = React.useMemo(
    () =>
      tokenIdsToCheck.map((tokenId) => ({
        // Fallback to default market address if we can't find a matching row (should not happen)
        address:
          rows.find((r) => r.tokenIdToClaim === tokenId)?.marketAddress ||
          '0x8D1D1946cBc56F695584761d25D13F174906671C',
        abi: PredictionMarket.abi as unknown as Abi,
        functionName: 'ownerOf',
        args: [tokenId],
        chainId:
          rows.find((r) => r.tokenIdToClaim === tokenId)?.chainId || 42161,
      })),
    [tokenIdsToCheck, rows]
  );
  const ownersResult = useReadContracts({
    contracts: ownerReads,
    query: { enabled: ownerReads.length > 0 },
  });
  const claimableTokenIds = React.useMemo(() => {
    const set = new Set<string>();
    const viewerAddr = String(account || '').toLowerCase();
    const items = ownersResult?.data || [];
    items.forEach((item, idx) => {
      if (item && item.status === 'success') {
        const owner = String(item.result || '').toLowerCase();
        if (owner && owner === viewerAddr) {
          set.add(String(tokenIdsToCheck[idx]));
        }
      }
    });
    return set;
  }, [ownersResult?.data, tokenIdsToCheck, account]);

  // On-chain resolution for active rows that have passed end time
  type ChainResolutionState =
    | { state: 'awaiting' }
    | { state: 'claim'; tokenId: bigint }
    | { state: 'lost' }
    | { state: 'claimed' };

  const nowMs = Date.now();
  const rowsNeedingResolution = React.useMemo(() => {
    return rows.filter(
      (r) =>
        r.status === 'active' &&
        r.endsAt <= nowMs &&
        r.addressRole !== 'unknown'
    );
  }, [rows, nowMs]);

  const viewerTokenInfo = React.useMemo(
    () =>
      rowsNeedingResolution.map((r) => ({
        rowKey: r.positionId,
        tokenId:
          r.addressRole === 'maker'
            ? BigInt(r.positionId) // positionId chosen from maker/taker id earlier
            : BigInt(r.positionId),
        // Note: positionId was set to the viewer-relevant NFT id earlier
        marketAddress: r.marketAddress,
        chainId: r.chainId,
      })),
    [rowsNeedingResolution]
  );

  // Phase 1: ownerOf(viewerTokenId)
  const activeOwnerReads = React.useMemo(
    () =>
      viewerTokenInfo.map((info) => ({
        address: info.marketAddress,
        abi: PredictionMarket.abi as unknown as Abi,
        functionName: 'ownerOf',
        args: [info.tokenId],
        chainId: info.chainId,
      })),
    [viewerTokenInfo]
  );
  const activeOwners = useReadContracts({
    contracts: activeOwnerReads,
    query: { enabled: activeOwnerReads.length > 0 },
  });

  // Derive which rows are still owned by the viewer
  const ownedRowEntries = React.useMemo(() => {
    const out: {
      rowKey: number;
      tokenId: bigint;
      marketAddress: Address;
      chainId: number;
    }[] = [];
    const items = activeOwners?.data || [];
    const viewerAddr = viewer;
    items.forEach((item, idx) => {
      const info = viewerTokenInfo[idx];
      if (!info) return;
      if (item && item.status === 'success') {
        const owner = String(item.result || '').toLowerCase();
        if (owner && owner === viewerAddr) {
          out.push({
            rowKey: info.rowKey,
            tokenId: info.tokenId,
            marketAddress: info.marketAddress,
            chainId: info.chainId,
          });
        }
      }
    });
    return out;
  }, [activeOwners?.data, viewer, viewerTokenInfo]);

  // Phase 2: getPrediction(tokenId) to obtain resolver + encodedPredictedOutcomes
  const getPredictionReads = React.useMemo(
    () =>
      ownedRowEntries.map((e) => ({
        address: e.marketAddress,
        abi: PredictionMarket.abi as unknown as Abi,
        functionName: 'getPrediction',
        args: [e.tokenId],
        chainId: e.chainId,
      })),
    [ownedRowEntries]
  );
  const predictionDatas = useReadContracts({
    contracts: getPredictionReads,
    query: { enabled: getPredictionReads.length > 0 },
  });

  // Phase 3: resolver.resolvePrediction(encodedPredictedOutcomes)
  const resolverReads = React.useMemo(() => {
    const calls: any[] = [];
    const preds = predictionDatas?.data || [];
    preds.forEach((item: any, idx: number) => {
      if (!item || item.status !== 'success') return;
      try {
        const result = item.result;
        const resolver: Address = result.resolver as Address;
        const encoded = result.encodedPredictedOutcomes as `0x${string}`;
        const base = ownedRowEntries[idx];
        if (resolver && encoded && base) {
          calls.push({
            address: resolver,
            abi: UMA_RESOLVER_MIN_ABI as unknown as Abi,
            functionName: 'resolvePrediction',
            args: [encoded],
            chainId: base.chainId,
          });
        }
      } catch {
        // ignore mis-shaped result
      }
    });
    return calls;
  }, [predictionDatas?.data, ownedRowEntries]);
  const resolverResults = useReadContracts({
    contracts: resolverReads,
    query: { enabled: resolverReads.length > 0 },
  });

  // Build a map from rowKey -> ChainResolutionState
  const rowKeyToResolution = React.useMemo(() => {
    const map = new Map<number, ChainResolutionState>();
    // default: if we attempted ownerOf but do not own, consider 'claimed'
    viewerTokenInfo.forEach((info, idx) => {
      const ownerItem = activeOwners?.data?.[idx];
      if (!ownerItem || ownerItem.status !== 'success') return;
      const owner = String(ownerItem.result || '').toLowerCase();
      if (!owner || owner !== viewer) {
        map.set(info.rowKey, { state: 'claimed' });
      }
    });

    const res = resolverResults?.data || [];
    for (let i = 0; i < res.length; i++) {
      const base = ownedRowEntries[i];
      const resItem = res[i];
      if (!base || !resItem) continue;
      const rowKey = base.rowKey;
      if (resItem.status !== 'success') {
        // couldn't resolve yet → awaiting
        if (!map.has(rowKey)) map.set(rowKey, { state: 'awaiting' });
        continue;
      }
      try {
        const tuple = resItem.result as any; // [isValid, error, makerWon]
        const isValid = Boolean(tuple?.[0]);
        const makerWon = Boolean(tuple?.[2]);
        if (!isValid) {
          map.set(rowKey, { state: 'awaiting' });
          continue;
        }
        // Determine if viewer is winner
        const row = rows.find((r) => r.positionId === rowKey);
        if (!row) continue;
        const viewerIsMaker = row.addressRole === 'maker';
        const viewerWon = viewerIsMaker ? makerWon : !makerWon;
        map.set(
          rowKey,
          viewerWon
            ? { state: 'claim', tokenId: base.tokenId }
            : { state: 'lost' }
        );
      } catch {
        if (!map.has(rowKey)) map.set(rowKey, { state: 'awaiting' });
      }
    }
    return map;
  }, [
    viewerTokenInfo,
    activeOwners?.data,
    resolverResults?.data,
    predictionDatas?.data,
    rows,
    viewer,
  ]);

  // Keep Share dialog open state outside of row to survive re-renders
  const [openShareParlayId, setOpenShareParlayId] = React.useState<
    number | null
  >(null);
  const selectedParlay = React.useMemo(() => {
    if (openShareParlayId === null) return null;
    return rows.find((r) => r.positionId === openShareParlayId) || null;
  }, [rows, openShareParlayId]);
  // ---

  const columns = React.useMemo<ColumnDef<UIParlay>[]>(
    () => [
      {
        id: 'positionId',
        accessorFn: (row) => row.positionId,
        sortingFn: (rowA, rowB) =>
          rowA.original.createdAt - rowB.original.createdAt,
        size: 360,
        minSize: 260,
        maxSize: 420,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Position
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const created = new Date(row.original.createdAt).toLocaleDateString(
            'en-US',
            {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short',
            }
          );
          return (
            <div>
              <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] mb-0.5">
                Position #{row.original.positionId}
              </h2>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span>created at {created}</span>
              </div>
              {row.original.counterpartyAddress && (
                <div className="text-sm text-muted-foreground flex items-baseline gap-1.5 mt-0.5">
                  <span>with</span>
                  <AddressDisplay
                    address={row.original.counterpartyAddress}
                    compact
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'wager',
        accessorFn: (row) => {
          // Show the viewer's contributed collateral as the wager
          const viewerWagerWei =
            row.addressRole === 'maker'
              ? (row.makerCollateralWei ?? 0n)
              : row.addressRole === 'taker'
                ? (row.takerCollateralWei ?? 0n)
                : (row.makerCollateralWei ?? row.takerCollateralWei ?? 0n);
          return Number(formatEther(viewerWagerWei));
        },
        size: 260,
        minSize: 220,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Wager
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = 'USDe';
          const isClosed = row.original.status !== 'active';
          const totalPayout = Number(
            formatEther(row.original.totalPayoutWei || 0n)
          );
          const viewerWagerWei =
            row.original.addressRole === 'maker'
              ? (row.original.makerCollateralWei ?? 0n)
              : row.original.addressRole === 'taker'
                ? (row.original.takerCollateralWei ?? 0n)
                : (row.original.makerCollateralWei ??
                  row.original.takerCollateralWei ??
                  0n);
          const viewerWager = Number(formatEther(viewerWagerWei));
          const pnlValue = Number(formatEther(BigInt(row.original.userPnL)));
          const roi = viewerWager > 0 ? (pnlValue / viewerWager) * 100 : 0;

          return (
            <div>
              <div className="whitespace-nowrap">
                <NumberDisplay value={viewerWager} /> {symbol}
              </div>
              {isClosed ? (
                row.original.status === 'won' ? (
                  <div className="text-sm text-muted-foreground mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
                    Won: <NumberDisplay value={Math.abs(pnlValue)} /> {symbol}
                    {viewerWager > 0 && (
                      <span className="text-xs text-green-600">
                        ({roi.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                ) : null
              ) : (
                <div className="text-sm text-muted-foreground mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
                  To Win: <NumberDisplay value={totalPayout} /> {symbol}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'conditions',
        accessorFn: (row) => row.legs.length,
        enableSorting: false,
        size: 400,
        minSize: 300,
        header: () => null,
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.addressRole === 'taker' && (
              <div className="mb-1">
                <div className="flex items-center gap-1">
                  <Badge variant="outline">Anti-Parlay</Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Anti-Parlay details"
                          className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground hover:text-foreground"
                        >
                          <HelpCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          This position is that one or more of these conditions
                          will not be met.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}
            <ParlayLegsList
              legs={row.original.legs.map((l) => ({
                shortName: l.question,
                question: l.question,
                conditionId: /^0x[0-9a-fA-F]{64}$/.test(String(l.question))
                  ? l.question
                  : undefined,
                choice: l.choice,
              }))}
            />
          </div>
        ),
      },

      {
        id: 'actions',
        enableSorting: false,
        size: 140,
        minSize: 100,
        header: () => null,
        cell: ({ row }) => (
          <div className="whitespace-nowrap xl:mt-0">
            <div className="flex items-center gap-2 justify-start xl:justify-end">
              {row.original.status === 'active' &&
                row.original.endsAt > Date.now() && (
                  <EndsInButton endsAtMs={row.original.endsAt} />
                )}
              {row.original.status === 'active' &&
                row.original.endsAt <= Date.now() &&
                row.original.addressRole !== 'unknown' &&
                (() => {
                  const res = rowKeyToResolution.get(row.original.positionId);
                  if (!res) return <AwaitingSettlementBadge />;
                  if (res.state === 'awaiting')
                    return <AwaitingSettlementBadge />;
                  if (res.state === 'claim') {
                    const isOwnerConnected =
                      connectedAddress &&
                      connectedAddress.toLowerCase() ===
                        String(account || '').toLowerCase();
                    return isOwnerConnected ? (
                      <Button
                        size="sm"
                        onClick={() => burn(res.tokenId, ZERO_REF_CODE)}
                        disabled={isClaimPending}
                      >
                        {isClaimPending ? 'Claiming...' : 'Claim Winnings'}
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled>
                                Claim Winnings
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[220px]">
                              {hasWallet
                                ? 'You can only claim winnings from the account that owns this parlay.'
                                : 'Connect your account to claim this parlay.'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                  if (res.state === 'lost') {
                    return (
                      <Button size="sm" variant="outline" disabled>
                        Parlay Lost
                      </Button>
                    );
                  }
                  return (
                    <Button size="sm" variant="outline" disabled>
                      Claimed
                    </Button>
                  );
                })()}
              {row.original.status === 'won' &&
                row.original.tokenIdToClaim !== undefined &&
                claimableTokenIds.has(String(row.original.tokenIdToClaim)) &&
                (() => {
                  const isOwnerConnected =
                    connectedAddress &&
                    connectedAddress.toLowerCase() ===
                      String(account || '').toLowerCase();
                  return isOwnerConnected ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        burn(row.original.tokenIdToClaim!, ZERO_REF_CODE)
                      }
                      disabled={isClaimPending}
                    >
                      {isClaimPending ? 'Claiming...' : 'Claim Winnings'}
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Claim Winnings
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-[220px]">
                            {hasWallet
                              ? 'You can only claim winnings from the account that owns this parlay.'
                              : 'Connect your account to claim this parlay.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              {row.original.status === 'won' &&
                (row.original.tokenIdToClaim === undefined ||
                  !claimableTokenIds.has(
                    String(row.original.tokenIdToClaim)
                  )) && (
                  <Button size="sm" variant="outline" disabled>
                    Claimed
                  </Button>
                )}
              {row.original.status === 'lost' && (
                <Button size="sm" variant="outline" disabled>
                  Parlay Lost
                </Button>
              )}
              {(() => {
                // Hide Share button when a lost state is displayed
                const res = rowKeyToResolution.get(row.original.positionId);
                const isLostDisplayed =
                  row.original.status === 'lost' || res?.state === 'lost';
                if (isLostDisplayed) return null;
                return (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                    onClick={() =>
                      setOpenShareParlayId(row.original.positionId)
                    }
                  >
                    Share
                  </button>
                );
              })()}
            </div>
          </div>
        ),
      },
    ],
    [
      isClaimPending,
      burn,
      account,
      rowKeyToResolution,
      claimableTokenIds,
      connectedAddress,
      hasWallet,
    ]
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'positionId', desc: true },
  ]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: false,
    getRowId: (row) => String(row.positionId),
  });

  // Claim button is inlined per row using shared hook to avoid many hook instances

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      {rows.length === 0 ? (
        <EmptyTabState message="No parlays found" />
      ) : (
        <div className="rounded border">
          <Table className="table-auto">
            <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.id === 'actions' ? 'text-right' : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`block xl:table-cell px-0 py-0 xl:px-4 xl:py-3 ${cell.column.id === 'actions' ? 'text-left xl:text-right xl:mt-0' : ''}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {selectedParlay && (
        <ShareDialog
          question={`Parlay #${selectedParlay.positionId}`}
          legs={selectedParlay.legs?.map((l) => ({
            question: l.question,
            choice: l.choice,
          }))}
          wager={Number(
            formatEther(
              selectedParlay.makerCollateralWei ??
                selectedParlay.takerCollateralWei ??
                0n
            )
          )}
          payout={Number(formatEther(selectedParlay.totalPayoutWei || 0n))}
          symbol="USDe"
          owner={String(account)}
          imagePath="/og/parlay"
          extraParams={
            selectedParlay.addressRole === 'taker' ? { anti: '1' } : undefined
          }
          open={openShareParlayId !== null}
          onOpenChange={(next) => {
            if (!next) setOpenShareParlayId(null);
          }}
          trigger={<span />}
          title="Share Your Parlay"
        />
      )}
    </div>
  );
}
