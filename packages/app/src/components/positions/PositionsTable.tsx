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
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import * as React from 'react';
import { useReadContracts, useAccount } from 'wagmi';
import type { Abi } from 'abitype';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
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
      { name: 'predictorWon', type: 'bool' },
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
import EmptyTabState from '~/components/shared/EmptyTabState';
import StackedPredictions, {
  type Pick,
} from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import {
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '~/lib/auction/decodePredictedOutcomes';
import { usePredictionMarketWriteContract } from '~/hooks/blockchain/usePredictionMarketWriteContract';
import {
  useUserParlays,
  useUserParlaysCount,
  type Parlay,
} from '~/hooks/graphql/useUserParlays';
import NumberDisplay from '~/components/shared/NumberDisplay';
import ShareDialog from '~/components/shared/ShareDialog';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import AwaitingSettlementBadge from '~/components/shared/AwaitingSettlementBadge';
import EnsAvatar from '~/components/shared/EnsAvatar';
import Loader from '~/components/shared/Loader';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import type { PythPrediction } from '@sapience/ui';

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
  const settlesAt = new Date(endsAtMs);
  const label = formatDistanceToNowStrict(settlesAt, {
    roundingMethod: 'round',
  });
  const settlesAtLocalDisplay = settlesAt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="whitespace-nowrap"
              disabled
            >
              {`Settles in ${label}`}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div>{`Settles at ${settlesAtLocalDisplay}`}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function PositionsTable({
  account,
  showHeaderText = true,
  chainId,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
}) {
  const pythSideForRole = (
    makerPrediction: boolean,
    role: UIPosition['addressRole']
  ): { choice: 'OVER' | 'UNDER'; direction: 'over' | 'under' } => {
    const displayPrediction =
      role === 'counterparty' ? !makerPrediction : makerPrediction;
    return displayPrediction
      ? { choice: 'OVER', direction: 'over' }
      : { choice: 'UNDER', direction: 'under' };
  };
  // ---
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId || 42161] || 'testUSDe';
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useAccount();
  const hasWallet = Boolean(connectedAddress);
  const [claimingTokenId, setClaimingTokenId] = React.useState<bigint | null>(
    null
  );
  const { burn, isPending: isClaimPending } = usePredictionMarketWriteContract({
    successMessage: 'Claim submitted',
    fallbackErrorMessage: 'Claim failed',
    onSuccess: () => {
      setClaimingTokenId(null);
      const addr = String(account || '').toLowerCase();
      queryClient
        .invalidateQueries({ queryKey: ['positions', addr] })
        .catch(() => {});
    },
  });
  type UILeg = {
    question: string;
    choice: string;
    conditionId?: string;
    categorySlug?: string | null;
    endTime?: number | null;
    description?: string | null;
    source?: 'uma' | 'pyth';
    pythPrediction?: PythPrediction;
    // For Pyth legs only: maker-side prediction (true=Over, false=Under).
    // Used to render the correct side for counterparty rows (which take the opposite side).
    pythMakerPrediction?: boolean;
  };
  type UIPosition = {
    uniqueRowKey: string;
    positionId: number;
    legs: UILeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // ms
    status: 'active' | 'won' | 'lost';
    tokenIdToClaim?: bigint;
    createdAt: number; // ms
    totalPayoutWei: bigint; // total payout if won
    predictorCollateralWei?: bigint; // user's wager if they are predictor
    counterpartyCollateralWei?: bigint; // user's wager if they are counterparty
    userPnL: string; // pnl for settled positions
    addressRole: 'predictor' | 'counterparty' | 'unknown';
    counterpartyAddress?: Address | null;
    chainId: number;
    marketAddress: Address;
  };

  // Infinite scroll state
  const ITEMS_PER_PAGE = 50;
  const [skip, setSkip] = React.useState(0);
  const [allLoadedData, setAllLoadedData] = React.useState<Parlay[]>([]);
  const [hasMore, setHasMore] = React.useState(true);

  // Sorting state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'created', desc: true },
  ]);

  // Convert sorting state to API params
  const orderBy = sorting[0]?.id;
  const orderDirection = sorting[0]?.desc ? 'desc' : 'asc';

  // Reset when account, sorting, or chainId changes
  React.useEffect(() => {
    setSkip(0);
    setAllLoadedData([]);
    setHasMore(true);
  }, [account, sorting, chainId]);

  // Fetch total count
  const totalCount = useUserParlaysCount(String(account), chainId);

  // Fetch real data with pagination - fetch one extra to detect if there are more pages
  const { data: rawData, isLoading } = useUserParlays({
    address: String(account),
    take: ITEMS_PER_PAGE + 1,
    skip,
    orderBy,
    orderDirection,
    chainId,
  });

  // Append new data when it arrives
  React.useEffect(() => {
    if (!rawData || rawData.length === 0) {
      if (skip === 0) {
        setAllLoadedData([]);
        setHasMore(false);
      }
      return;
    }

    const hasNextPage = rawData.length > ITEMS_PER_PAGE;
    const newItems = hasNextPage ? rawData.slice(0, ITEMS_PER_PAGE) : rawData;

    if (skip === 0) {
      // First load - replace all data
      setAllLoadedData(newItems);
    } else {
      // Subsequent loads - append data
      setAllLoadedData((prev) => [...prev, ...newItems]);
    }

    setHasMore(hasNextPage);
  }, [rawData, skip]);

  // Use accumulated data
  const data = allLoadedData;

  // Load more handler (wrapped in useCallback for IntersectionObserver dependency)
  const handleLoadMore = React.useCallback(() => {
    if (!isLoading && hasMore) {
      setSkip((prev) => prev + ITEMS_PER_PAGE);
    }
  }, [isLoading, hasMore]);

  // ---

  const viewer = React.useMemo(
    () => String(account || '').toLowerCase(),
    [account]
  );
  const rows: UIPosition[] = React.useMemo(() => {
    const positionRows = (data || []).flatMap((p: any) => {
      const parsePythDescriptor = (
        desc: string | null | undefined
      ): {
        strikePrice: bigint;
        strikeExpo: number;
        priceId?: string;
      } | null => {
        const s = (desc ?? '').trim();
        if (!s.startsWith('PYTH_LAZER|')) return null;
        const firstLine = s.split('\n')[0] ?? s;
        const parts = firstLine.split('|');
        const kv = new Map<string, string>();
        for (const part of parts.slice(1)) {
          const i = part.indexOf('=');
          if (i <= 0) continue;
          kv.set(part.slice(0, i), part.slice(i + 1));
        }
        const priceId = kv.get('priceId') || undefined;
        const strikePriceStr = kv.get('strikePrice');
        const strikeExpoStr = kv.get('strikeExpo');
        if (!strikePriceStr || !strikeExpoStr) return null;
        try {
          const strikePrice = BigInt(strikePriceStr);
          const strikeExpo = Number(strikeExpoStr);
          if (!Number.isFinite(strikeExpo)) return null;
          return { strikePrice, strikeExpo, priceId };
        } catch {
          return null;
        }
      };

      const legs: UILeg[] = (p.predictions || []).map((o: any) => {
        const question =
          o?.condition?.shortName || o?.condition?.question || o.conditionId;
        const desc = o?.condition?.description ?? null;
        const pythMeta = parsePythDescriptor(desc);
        if (pythMeta) {
          const strikeStr = formatPythPriceDecimalFromInt(
            pythMeta.strikePrice,
            pythMeta.strikeExpo
          );
          const priceNum = Number(strikeStr);
          const endTimeSec: number | null =
            typeof o?.condition?.endTime === 'number'
              ? o.condition.endTime
              : null;
          const dateTimeLocal =
            endTimeSec !== null
              ? formatUnixSecondsToLocalInput(BigInt(endTimeSec))
              : '';
          const feedLabel = String(
            o?.condition?.shortName || o?.condition?.question || question || ''
          );

          // Note: `o.outcomeYes` is stored as the maker/predictor-side prediction for Pyth.
          // We keep it here and compute display direction per-role later.
          const makerPrediction = Boolean(o.outcomeYes);
          const pythPrediction: PythPrediction = {
            id: `${o?.conditionId ?? 'pyth'}:${strikeStr}:${pythMeta.strikeExpo}:${endTimeSec ?? 'no-end'}`,
            priceId: pythMeta.priceId || o?.conditionId || feedLabel || 'pyth',
            priceFeedLabel: feedLabel || undefined,
            direction: makerPrediction ? ('over' as const) : ('under' as const),
            targetPrice: Number.isFinite(priceNum) ? priceNum : 0,
            targetPriceRaw: strikeStr,
            targetPriceFullPrecision: strikeStr,
            priceExpo: pythMeta.strikeExpo,
            dateTimeLocal: dateTimeLocal || '—',
          };
          return {
            question,
            // For display we render structured Pyth legs (not a choice badge).
            // Keep a simple string for any fallback renderers.
            choice: makerPrediction ? 'OVER' : 'UNDER',
            conditionId: o?.conditionId,
            categorySlug: null,
            endTime: o?.condition?.endTime ?? null,
            description: desc,
            source: 'pyth' as const,
            pythPrediction,
            pythMakerPrediction: makerPrediction,
          };
        }

        return {
          question,
          choice: o.outcomeYes ? 'YES' : 'NO',
          conditionId: o?.conditionId,
          categorySlug: o?.condition?.category?.slug ?? null,
          endTime: o?.condition?.endTime ?? null,
          description: desc,
          source: 'uma' as const,
        };
      });
      const endsAtSec =
        p.endsAt ||
        Math.max(
          0,
          ...(p.predictions || []).map((o: any) => o?.condition?.endTime || 0)
        );
      const userIsPredictor =
        typeof p.predictor === 'string' && p.predictor.toLowerCase() === viewer;
      const userIsCounterparty =
        typeof p.counterparty === 'string' &&
        p.counterparty.toLowerCase() === viewer;
      const isActive = p.status === 'active';

      const viewerPredictorCollateralWei = (() => {
        try {
          return p.predictorCollateral
            ? BigInt(p.predictorCollateral)
            : undefined;
        } catch {
          return undefined;
        }
      })();
      const viewerCounterpartyCollateralWei = (() => {
        try {
          return p.counterpartyCollateral
            ? BigInt(p.counterpartyCollateral)
            : undefined;
        } catch {
          return undefined;
        }
      })();

      const totalPayoutWei = (() => {
        try {
          return BigInt(p.totalCollateral || '0');
        } catch {
          return 0n;
        }
      })();

      const roles: UIPosition['addressRole'][] =
        userIsPredictor && userIsCounterparty
          ? (['predictor', 'counterparty'] as const)
          : userIsPredictor
            ? (['predictor'] as const)
            : userIsCounterparty
              ? (['counterparty'] as const)
              : (['unknown'] as const);

      const buildRowForRole = (role: UIPosition['addressRole']): UIPosition => {
        const roleWon =
          !isActive &&
          (role === 'predictor'
            ? p.predictorWon === true
            : role === 'counterparty'
              ? p.predictorWon === false
              : false);

        const status: UIPosition['status'] = isActive
          ? 'active'
          : roleWon
            ? 'won'
            : 'lost';

        const tokenIdToClaim = (() => {
          if (!roleWon) return undefined;
          try {
            if (role === 'predictor') return BigInt(p.predictorNftTokenId);
            if (role === 'counterparty')
              return BigInt(p.counterpartyNftTokenId);
            return undefined;
          } catch {
            return undefined;
          }
        })();

        // Calculate PnL for settled positions (per-role; important when viewer is both sides)
        let userPnL = '0';
        if (
          !isActive &&
          p.predictorCollateral &&
          p.counterpartyCollateral &&
          p.totalCollateral &&
          role !== 'unknown'
        ) {
          try {
            const predictorCollateral = BigInt(p.predictorCollateral);
            const counterpartyCollateral = BigInt(p.counterpartyCollateral);
            const totalCollateral = BigInt(p.totalCollateral);

            if (role === 'predictor') {
              userPnL = p.predictorWon
                ? (totalCollateral - predictorCollateral).toString()
                : (-predictorCollateral).toString();
            } else if (role === 'counterparty') {
              userPnL = !p.predictorWon
                ? (totalCollateral - counterpartyCollateral).toString()
                : (-counterpartyCollateral).toString();
            }
          } catch (e) {
            console.error('Error calculating position PnL:', e);
          }
        }

        // Choose positionId based on the role for this row.
        const positionId =
          role === 'predictor'
            ? Number(p.predictorNftTokenId)
            : role === 'counterparty'
              ? Number(p.counterpartyNftTokenId)
              : p.predictorNftTokenId
                ? Number(p.predictorNftTokenId)
                : p.id;

        // Create unique row key combining prediction id, role, and token id (stable + unique).
        const uniqueRowKey = `${p.id}-${role}-${positionId}`;

        return {
          uniqueRowKey,
          positionId,
          legs: legs.map((leg) => {
            // Flip display sides for counterparty rows:
            // - Pyth: maker prediction is stored; counterparty is opposite
            // - UMA: counterparty is opposite of the predictor's YES/NO
            if (role === 'counterparty') {
              if (leg.source === 'pyth' && leg.pythPrediction) {
                const makerPrediction = Boolean(leg.pythMakerPrediction);
                const side = pythSideForRole(makerPrediction, role);
                return {
                  ...leg,
                  choice: side.choice,
                  pythPrediction: {
                    ...leg.pythPrediction,
                    direction: side.direction,
                  },
                };
              }

              const upper = String(leg.choice || '').toUpperCase();
              if (upper === 'YES') return { ...leg, choice: 'NO' };
              if (upper === 'NO') return { ...leg, choice: 'YES' };
            }

            if (leg.source === 'pyth' && leg.pythPrediction) {
              // Predictor row (or unknown): ensure Pyth direction matches maker side.
              const makerPrediction = Boolean(leg.pythMakerPrediction);
              const side = pythSideForRole(makerPrediction, role);
              return {
                ...leg,
                choice: side.choice,
                pythPrediction: {
                  ...leg.pythPrediction,
                  direction: side.direction,
                },
              };
            }

            return leg;
          }),
          direction: 'Long' as const,
          endsAt: endsAtSec ? endsAtSec * 1000 : Date.now(),
          status,
          tokenIdToClaim,
          createdAt: p.mintedAt ? Number(p.mintedAt) * 1000 : Date.now(),
          totalPayoutWei: totalPayoutWei,
          predictorCollateralWei: viewerPredictorCollateralWei,
          counterpartyCollateralWei: viewerCounterpartyCollateralWei,
          userPnL,
          addressRole: role,
          counterpartyAddress:
            (role === 'predictor'
              ? (p.counterparty as Address | undefined)
              : role === 'counterparty'
                ? (p.predictor as Address | undefined)
                : undefined) ?? null,
          chainId: Number(p.chainId || DEFAULT_CHAIN_ID),
          marketAddress: p.marketAddress as Address,
        };
      };

      return roles.map(buildRowForRole);
    });

    return positionRows;
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
          rows.find((r) => r.tokenIdToClaim === tokenId)?.marketAddress ??
          rows[0]?.marketAddress,
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'ownerOf',
        args: [tokenId],
        chainId:
          rows.find((r) => r.tokenIdToClaim === tokenId)?.chainId ||
          DEFAULT_CHAIN_ID,
      })),
    [tokenIdsToCheck, rows]
  );
  const ownersResult = useReadContracts({
    contracts: ownerReads,
    query: { enabled: !isLoading && ownerReads.length > 0 },
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

  const viewerTokenInfo = React.useMemo(() => {
    return rowsNeedingResolution.map((r) => ({
      rowKey: r.positionId,
      tokenId:
        r.addressRole === 'predictor'
          ? BigInt(r.positionId) // positionId chosen from predictor/counterparty id earlier
          : BigInt(r.positionId),
      // Note: positionId was set to the viewer-relevant NFT id earlier
      marketAddress: r.marketAddress,
      chainId: r.chainId,
    }));
  }, [rowsNeedingResolution]);

  // Phase 1: ownerOf(viewerTokenId)
  const activeOwnerReads = React.useMemo(
    () =>
      viewerTokenInfo.map((info) => ({
        address: info.marketAddress,
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'ownerOf',
        args: [info.tokenId],
        chainId: info.chainId,
      })),
    [viewerTokenInfo]
  );
  const activeOwners = useReadContracts({
    contracts: activeOwnerReads,
    query: { enabled: !isLoading && activeOwnerReads.length > 0 },
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

      if (!item) return;

      if (item.status === 'success') {
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
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'getPrediction',
        args: [e.tokenId],
        chainId: e.chainId,
      })),
    [ownedRowEntries]
  );
  const predictionDatas = useReadContracts({
    contracts: getPredictionReads,
    query: { enabled: !isLoading && getPredictionReads.length > 0 },
  });

  // Phase 3: resolver.resolvePrediction(encodedPredictedOutcomes)
  const resolverReads = React.useMemo(() => {
    const calls: any[] = [];
    const preds = predictionDatas?.data || [];

    preds.forEach((item: any, idx: number) => {
      const base = ownedRowEntries[idx];

      if (!item || item.status !== 'success') return;

      try {
        const result = item.result;
        const resolver: Address = result.resolver as Address;
        const encoded = result.encodedPredictedOutcomes as `0x${string}`;

        if (!resolver || !encoded || !base) return;

        calls.push({
          address: resolver,
          abi: UMA_RESOLVER_MIN_ABI as unknown as Abi,
          functionName: 'resolvePrediction',
          args: [encoded],
          chainId: base.chainId,
        });
      } catch {
        // ignore mis-shaped result
      }
    });

    return calls;
  }, [predictionDatas?.data, ownedRowEntries]);
  const resolverResults = useReadContracts({
    contracts: resolverReads,
    query: { enabled: !isLoading && resolverReads.length > 0 },
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
        const tuple = resItem.result as any; // [isValid, error, predictorWon]
        const isValid = Boolean(tuple?.[0]);
        const predictorWon = Boolean(tuple?.[2]);
        if (!isValid) {
          map.set(rowKey, { state: 'awaiting' });
          continue;
        }
        // Determine if viewer is winner
        const row = rows.find((r) => r.positionId === rowKey);
        if (!row) continue;
        const viewerIsPredictor = row.addressRole === 'predictor';
        const viewerWon = viewerIsPredictor ? predictorWon : !predictorWon;
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
  const [openSharePositionId, setOpenSharePositionId] = React.useState<
    number | null
  >(null);
  const selectedPosition = React.useMemo(() => {
    if (openSharePositionId === null) return null;
    return rows.find((r) => r.positionId === openSharePositionId) || null;
  }, [rows, openSharePositionId]);

  // Find the original Parlay data to get predictorNftTokenId for sharing
  const selectedParlay = React.useMemo(() => {
    if (!selectedPosition) return null;
    // Find the original parlay by matching marketAddress and chainId
    // The positionId in the row might be the NFT ID, so we need to find the parlay
    return (
      data.find(
        (p: any) =>
          p.marketAddress?.toLowerCase() ===
            selectedPosition.marketAddress?.toLowerCase() &&
          p.chainId === selectedPosition.chainId &&
          (p.predictorNftTokenId === String(selectedPosition.positionId) ||
            p.counterpartyNftTokenId === String(selectedPosition.positionId))
      ) || null
    );
  }, [selectedPosition, data]);
  // ---

  const columns = React.useMemo<ColumnDef<UIPosition>[]>(
    () => [
      {
        id: 'created',
        accessorFn: (row) => row.createdAt,
        size: 150,
        minSize: 0,
        maxSize: 160,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Created
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
          const createdDate = new Date(row.original.createdAt);
          const createdDisplay = formatDistanceToNow(createdDate, {
            addSuffix: true,
          });
          const exactLocalDisplay = createdDate.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          });
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Created
              </div>
              <div className="text-[15px] leading-[1.35] tracking-[-0.01em] mb-0.5 whitespace-nowrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{createdDisplay}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div>{exactLocalDisplay}</div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap font-mono uppercase">{`ID #${row.original.positionId}`}</div>
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
        header: () => <span>Predictions</span>,
        cell: ({ row }) => {
          const hasPythLeg = (row.original.legs || []).some(
            (leg) => leg.source === 'pyth'
          );
          return (
            <div className="text-sm">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Predictions
              </div>
              <div className="flex flex-col xl:flex-row xl:items-center gap-2">
                {row.original.addressRole === 'counterparty' && (
                  <>
                    {/* Counterparty badge is only shown for UMA (non-Pyth) positions */}
                    {!hasPythLeg ? <CounterpartyBadge /> : null}
                  </>
                )}
                <StackedPredictions
                  legs={
                    row.original.legs.map(
                      (leg): Pick => ({
                        question: leg.question,
                        choice: leg.choice,
                        conditionId: leg.conditionId,
                        categorySlug: leg.categorySlug ?? null,
                        endTime: leg.endTime ?? null,
                        description: leg.description ?? null,
                        source: leg.source,
                        pythPrediction: leg.pythPrediction,
                      })
                    ) ?? []
                  }
                  className="max-w-full flex-1 min-w-0"
                />
              </div>
            </div>
          );
        },
      },

      {
        id: 'counterparty',
        accessorFn: (row) => row.counterpartyAddress ?? null,
        enableSorting: false,
        size: 240,
        minSize: 200,
        header: () => <span>Opponent</span>,
        cell: ({ row }) => (
          <div>
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Opponent
            </div>
            {row.original.counterpartyAddress ? (
              <div className="whitespace-nowrap text-[15px] min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <EnsAvatar
                    address={row.original.counterpartyAddress}
                    className="shrink-0 rounded-sm ring-1 ring-border/50"
                    width={20}
                    height={20}
                  />
                  <AddressDisplay
                    address={row.original.counterpartyAddress}
                    className="text-[15px] min-w-0"
                  />
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
      },

      {
        id: 'wager',
        accessorFn: (row) => {
          // Show the viewer's contributed collateral as the wager
          const viewerWagerWei =
            row.addressRole === 'predictor'
              ? (row.predictorCollateralWei ?? 0n)
              : row.addressRole === 'counterparty'
                ? (row.counterpartyCollateralWei ?? 0n)
                : (row.predictorCollateralWei ??
                  row.counterpartyCollateralWei ??
                  0n);
          return Number(formatEther(viewerWagerWei));
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
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
          const symbol = collateralSymbol;
          const viewerWagerWei =
            row.original.addressRole === 'predictor'
              ? (row.original.predictorCollateralWei ?? 0n)
              : row.original.addressRole === 'counterparty'
                ? (row.original.counterpartyCollateralWei ?? 0n)
                : (row.original.predictorCollateralWei ??
                  row.original.counterpartyCollateralWei ??
                  0n);
          const viewerWager = Number(formatEther(viewerWagerWei));

          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Wager
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <NumberDisplay
                  value={viewerWager}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'toWin',
        accessorFn: (row) => {
          const totalPayout = Number(formatEther(row.totalPayoutWei || 0n));
          // For sorting, treat lost as 0
          if (row.status === 'lost') return 0;
          return totalPayout;
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            To Win
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
          const symbol = collateralSymbol;
          const totalPayout = Number(
            formatEther(row.original.totalPayoutWei || 0n)
          );
          if (
            row.original.status === 'lost' ||
            rowKeyToResolution.get(row.original.positionId)?.state === 'lost'
          ) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  To Win
                </div>
                <span className="text-muted-foreground">Wager Lost</span>
              </div>
            );
          }
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                To Win
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <NumberDisplay
                  value={totalPayout}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'pnl',
        accessorFn: (row) => {
          const pnlValue = Number(formatEther(BigInt(row.userPnL || '0')));
          return pnlValue;
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Profit/Loss
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
          const symbol = collateralSymbol;
          const isClosed = row.original.status !== 'active';
          const lostPositionUnclaimed =
            row.original.status === 'active' &&
            rowKeyToResolution.get(row.original.positionId)?.state === 'lost';

          if (!isClosed && !lostPositionUnclaimed) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  Profit/Loss
                </div>
                <span className="text-muted-foreground">Pending</span>
              </div>
            );
          }

          const viewerWagerWei =
            row.original.addressRole === 'predictor'
              ? (row.original.predictorCollateralWei ?? 0n)
              : row.original.addressRole === 'counterparty'
                ? (row.original.counterpartyCollateralWei ?? 0n)
                : (row.original.predictorCollateralWei ??
                  row.original.counterpartyCollateralWei ??
                  0n);
          const viewerWager = Number(formatEther(viewerWagerWei));

          const pnlValue = lostPositionUnclaimed
            ? -viewerWager
            : Number(formatEther(BigInt(row.original.userPnL || '0')));

          const roi = viewerWager > 0 ? (pnlValue / viewerWager) * 100 : 0;

          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Profit/Loss
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <span className="tabular-nums text-brand-white font-mono">
                  {pnlValue < 0 ? '-' : ''}
                </span>
                <NumberDisplay
                  value={Math.abs(pnlValue)}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
              {viewerWager > 0 && (
                <div
                  className={`text-xs tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  ({roi >= 0 ? '+' : ''}
                  {roi.toFixed(2)}%)
                </div>
              )}
            </div>
          );
        },
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
                  const positionId = row.original.positionId;
                  const res = rowKeyToResolution.get(positionId);

                  if (!res) {
                    return <AwaitingSettlementBadge />;
                  }
                  if (res.state === 'awaiting') {
                    return <AwaitingSettlementBadge />;
                  }
                  if (res.state === 'claim') {
                    const isOwnerConnected =
                      connectedAddress &&
                      connectedAddress.toLowerCase() ===
                        String(account || '').toLowerCase();
                    const isThisTokenClaiming =
                      isClaimPending && claimingTokenId === res.tokenId;

                    return isOwnerConnected ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setClaimingTokenId(res.tokenId);
                          burn(res.tokenId, ZERO_REF_CODE);
                        }}
                        disabled={isClaimPending}
                      >
                        {isThisTokenClaiming ? 'Claiming...' : 'Claim Winnings'}
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
                                ? 'You can only claim winnings from the account that owns this position.'
                                : 'Connect your account to claim this position.'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                  if (res.state === 'lost') {
                    return (
                      <Button size="sm" variant="outline" disabled>
                        Wager Lost
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
                  const isThisTokenClaiming =
                    isClaimPending &&
                    claimingTokenId === row.original.tokenIdToClaim;
                  return isOwnerConnected ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setClaimingTokenId(row.original.tokenIdToClaim!);
                        burn(row.original.tokenIdToClaim!, ZERO_REF_CODE);
                      }}
                      disabled={isClaimPending}
                    >
                      {isThisTokenClaiming ? 'Claiming...' : 'Claim Winnings'}
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
                              ? 'You can only claim winnings from the account that owns this position.'
                              : 'Connect your account to claim this position.'}
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
                  Wager Lost
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
                      setOpenSharePositionId(row.original.positionId)
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

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, // Disable client-side sorting, we're doing server-side sorting
    columnResizeMode: 'onChange',
    enableColumnResizing: false,
    getRowId: (row) => row.uniqueRowKey,
  });

  // Claim button is inlined per row using shared hook to avoid many hook instances

  // Auto-load more when scrolling near bottom
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          handleLoadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px', // Start loading 100px before the element is visible
      }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoading, handleLoadMore]);

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Positions</h2>
      )}
      {rows.length === 0 && !isLoading ? (
        <EmptyTabState centered message="No positions found" />
      ) : isLoading && rows.length === 0 ? (
        <div className="w-full min-h-[300px] flex items-center justify-center">
          <Loader size={12} />
        </div>
      ) : (
        <>
          <div className="border-y border-border rounded-none overflow-hidden bg-brand-black relative">
            {isLoading && (
              <div className="absolute inset-0 bg-brand-black/50 flex items-center justify-center z-10">
                <Loader size={12} />
              </div>
            )}
            <Table className="w-full table-fixed">
              <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          [
                            header.id === 'created'
                              ? 'xl:w-[150px] whitespace-nowrap'
                              : '',
                            header.id === 'conditions' ? 'xl:w-auto' : '',
                            header.id === 'counterparty' ? 'xl:w-[240px]' : '',
                            header.id === 'wager' ? 'xl:w-[170px]' : '',
                            header.id === 'toWin' ? 'xl:w-[170px]' : '',
                            header.id === 'pnl' ? 'xl:w-[170px]' : '',
                            header.id === 'actions'
                              ? 'xl:w-[220px] text-right'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
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
                    className="group xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`block xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${
                          cell.column.id === 'created'
                            ? 'xl:w-[150px] whitespace-nowrap'
                            : ''
                        } ${cell.column.id === 'conditions' ? 'xl:w-auto' : ''} ${
                          cell.column.id === 'counterparty'
                            ? 'xl:w-[240px] min-w-0'
                            : ''
                        } ${cell.column.id === 'wager' ? 'xl:w-[170px]' : ''} ${
                          cell.column.id === 'toWin' ? 'xl:w-[170px]' : ''
                        } ${cell.column.id === 'pnl' ? 'xl:w-[170px]' : ''} ${
                          cell.column.id === 'actions'
                            ? 'xl:w-[220px] text-left xl:text-right xl:mt-0'
                            : ''
                        }`}
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
          {/* Infinite scroll sentinel - triggers auto-load when visible */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center px-4 py-6 border-b border-border bg-brand-black"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader size={12} />
                  <span className="text-sm text-muted-foreground">
                    Loading more positions...
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Scroll to load more • {data.length} of {totalCount}
                </span>
              )}
            </div>
          )}
        </>
      )}
      {selectedPosition && (
        <ShareDialog
          question={`Position #${selectedPosition.positionId}`}
          nftId={
            selectedPosition.addressRole === 'counterparty'
              ? selectedParlay?.counterpartyNftTokenId
              : selectedParlay?.predictorNftTokenId ||
                String(selectedPosition.positionId)
          }
          marketAddress={selectedPosition.marketAddress}
          legs={selectedPosition.legs?.map((l) => ({
            question: l.question,
            choice: l.choice,
          }))}
          wager={Number(
            formatEther(
              selectedPosition.predictorCollateralWei ??
                selectedPosition.counterpartyCollateralWei ??
                0n
            )
          )}
          payout={Number(formatEther(selectedPosition.totalPayoutWei || 0n))}
          symbol="USDe"
          owner={String(account)}
          imagePath="/og/position"
          extraParams={{
            ...(selectedPosition.addressRole === 'counterparty'
              ? { anti: '1' }
              : {}),
          }}
          open={openSharePositionId !== null}
          onOpenChange={(next) => {
            if (!next) setOpenSharePositionId(null);
          }}
          trigger={<span />}
          title="Share Your Position"
        />
      )}
    </div>
  );
}
