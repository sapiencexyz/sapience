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
import { ChevronUp, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useReadContracts, useAccount } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import type { Abi } from 'abitype';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useQueryClient } from '@tanstack/react-query';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import EmptyTabState from '~/components/shared/EmptyTabState';
import PicksSummary from '~/components/shared/PicksSummary';
import CountdownCell from '~/components/shared/CountdownCell';
import { formatDistanceToNow } from 'date-fns';
import {
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '~/lib/auction/decodePredictedOutcomes';
import { usePredictionMarketWriteContract } from '~/hooks/blockchain/usePredictionMarketWriteContract';
import {
  useUserPositions,
  useUserPositionsCount,
  type Position,
} from '~/hooks/graphql/useUserPositions';
import NumberDisplay from '~/components/shared/NumberDisplay';
import ShareDialog from '~/components/shared/ShareDialog';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import Loader from '~/components/shared/Loader';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import type { PythPrediction } from '@sapience/ui';
import { calculatePositionPnLWei } from '~/lib/utils/calculatePositionPnL';
import {
  PositionsTableFilters,
  getDefaultPositionsFilterState,
  type PositionsFilterState,
} from '~/components/positions/PositionsTableFilters';
import PositionDialog from '~/components/positions/PositionDialog';

export type UILeg = {
  question: string;
  choice: string;
  conditionId?: string;
  resolverAddress?: string | null;
  categorySlug?: string | null;
  endTime?: number | null;
  description?: string | null;
  source?: 'uma' | 'pyth';
  pythPrediction?: PythPrediction;
  // For Pyth legs only: maker-side prediction (true=Over, false=Under).
  // Used to render the correct side for counterparty rows (which take the opposite side).
  pythMakerPrediction?: boolean;
  settled?: boolean;
  resolvedToYes?: boolean;
  predictorBetYes?: boolean;
};

export type UIPosition = {
  uniqueRowKey: string;
  positionId: number;
  legs: UILeg[];
  direction: 'Long' | 'Short';
  endsAt: number; // ms
  status: 'active' | 'won' | 'lost';
  tokenIdToClaim?: bigint;
  createdAt: number; // ms
  totalPayoutWei: bigint; // total payout if won
  /** Position size for this position (predictor's collateral if predictor position, counterparty's if counterparty position) */
  positionSizeWei: bigint;
  pnlWei: string; // pnl for settled positions
  /** Whether this is a counterparty position (as opposed to predictor position) - intrinsic to the NFT */
  isCounterpartyPosition: boolean;
  /** The opponent's address (counterparty if this is predictor position, predictor if counterparty position) */
  opponentAddress?: Address | null;
  /** Absolute predictor address */
  predictor?: Address | null;
  /** Absolute counterparty address */
  counterparty?: Address | null;
  chainId: number;
  marketAddress: Address;
  allConditionsSettled?: boolean;
  predictorWonFromDb?: boolean;
};

export default function PositionsTable({
  account,
  showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  // ---
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId || 42161] || 'testUSDe';
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useAccount();
  const { effectiveAddress: sessionEffectiveAddress } = useSession();
  const hasWallet = Boolean(connectedAddress);
  // Use effectiveAddress from session context for ownership checks
  const effectiveAddress = sessionEffectiveAddress?.toLowerCase();
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
  // Infinite scroll state
  const ITEMS_PER_PAGE = 50;
  const [skip, setSkip] = React.useState(0);
  const [allLoadedData, setAllLoadedData] = React.useState<Position[]>([]);
  const [hasMore, setHasMore] = React.useState(true);

  // Sorting state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'created', desc: true },
  ]);

  // Filter state
  const [filters, setFilters] = React.useState<PositionsFilterState>(
    getDefaultPositionsFilterState
  );

  // Convert sorting state to API params
  const sortId = sorting[0]?.id;
  const orderBy =
    sortId === 'created' ? 'created' : sortId === 'status' ? 'endsAt' : sortId;
  const orderDirection = sorting[0]?.desc ? 'desc' : 'asc';

  // Map filter state to server-side params
  const serverStatus = React.useMemo((): string | undefined => {
    // UI statuses: active, won, lost
    // Server statuses: active, settled, consolidated
    // "active" maps directly; "won" and "lost" both map to "settled"
    if (filters.status.length === 1) {
      if (filters.status[0] === 'active') return 'active';
      if (filters.status[0] === 'won' || filters.status[0] === 'lost')
        return 'settled';
    }
    // If both won+lost selected (but not active), that's all settled
    if (
      filters.status.length === 2 &&
      filters.status.includes('won') &&
      filters.status.includes('lost')
    ) {
      return 'settled';
    }
    return undefined;
  }, [filters.status]);

  const serverEndsAtGte = React.useMemo((): number | undefined => {
    // dateRange[0] >= 0 means "ends in the future"
    if (filters.dateRange[0] >= 0) {
      return Math.floor(Date.now() / 1000);
    }
    return undefined;
  }, [filters.dateRange]);

  // Track what data we've already processed to avoid infinite loops
  const processedRef = React.useRef<{ skip: number; length: number } | null>(
    null
  );

  // Reset when account, sorting, or chainId change (server-side params only)
  // Don't clear allLoadedData — placeholderData in the hook keeps stale results
  // visible until new data arrives, preventing layout collapse
  React.useEffect(() => {
    setSkip(0);
    setHasMore(true);
    processedRef.current = null;
  }, [account, sorting, chainId, serverStatus, serverEndsAtGte]);

  // Fetch total count
  const totalCount = useUserPositionsCount(String(account), chainId);

  // Fetch real data with pagination - fetch one extra to detect if there are more pages
  const { data: rawData, isLoading } = useUserPositions({
    address: String(account),
    take: ITEMS_PER_PAGE + 1,
    skip,
    orderBy,
    orderDirection,
    chainId,
    status: serverStatus,
    endsAtGte: serverEndsAtGte,
  });

  React.useEffect(() => {
    const dataLength = rawData?.length ?? 0;

    // Skip if we've already processed this exact data
    if (
      processedRef.current?.skip === skip &&
      processedRef.current?.length === dataLength
    ) {
      return;
    }
    processedRef.current = { skip, length: dataLength };

    if (!rawData || rawData.length === 0) {
      if (skip === 0) {
        setAllLoadedData((prev) => (prev.length === 0 ? prev : []));
        setHasMore((prev) => (prev === false ? prev : false));
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
        const question = o?.condition?.question || o.conditionId;
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
          const feedLabel = String(o?.condition?.question || question || '');

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
            resolverAddress: o?.condition?.resolver ?? null,
            categorySlug: null,
            endTime: o?.condition?.endTime ?? null,
            description: desc,
            source: 'pyth' as const,
            pythPrediction,
            pythMakerPrediction: makerPrediction,
            settled: o?.condition?.settled,
            resolvedToYes: o?.condition?.resolvedToYes,
            predictorBetYes: makerPrediction,
          };
        }

        return {
          question,
          choice: o.outcomeYes ? 'YES' : 'NO',
          conditionId: o?.conditionId,
          resolverAddress: o?.condition?.resolver ?? null,
          categorySlug: o?.condition?.category?.slug ?? null,
          endTime: o?.condition?.endTime ?? null,
          description: desc,
          source: 'uma' as const,
          settled: o?.condition?.settled,
          resolvedToYes: o?.condition?.resolvedToYes,
          predictorBetYes: o.outcomeYes,
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

      // Determine which position types to show for this account
      // Each position can have predictor NFT, counterparty NFT, or both (if same account owns both)
      const positionTypes: boolean[] = // true = counterparty position, false = predictor position
        userIsPredictor && userIsCounterparty
          ? [false, true] // Show both positions
          : userIsPredictor
            ? [false] // Predictor position only
            : userIsCounterparty
              ? [true] // Counterparty position only
              : [false]; // Default to predictor view for unknown

      const buildRowForPositionType = (
        isCounterpartyPosition: boolean
      ): UIPosition => {
        const positionWon =
          !isActive &&
          (isCounterpartyPosition
            ? p.predictorWon === false // Counterparty wins when predictor loses
            : p.predictorWon === true); // Predictor wins when predictorWon is true

        const status: UIPosition['status'] = isActive
          ? 'active'
          : positionWon
            ? 'won'
            : 'lost';

        const tokenIdToClaim = (() => {
          if (!positionWon) return undefined;
          try {
            return isCounterpartyPosition
              ? BigInt(p.counterpartyNftTokenId)
              : BigInt(p.predictorNftTokenId);
          } catch {
            return undefined;
          }
        })();

        // Position size is the collateral for this position type
        const positionSizeWei = isCounterpartyPosition
          ? (viewerCounterpartyCollateralWei ?? 0n)
          : (viewerPredictorCollateralWei ?? 0n);

        // Calculate PnL for settled positions
        let pnlWei = '0';
        if (
          !isActive &&
          p.predictorCollateral &&
          p.counterpartyCollateral &&
          p.totalCollateral
        ) {
          pnlWei = calculatePositionPnLWei({
            predictorWon: p.predictorWon,
            isCounterparty: isCounterpartyPosition,
            predictorCollateral: p.predictorCollateral,
            counterpartyCollateral: p.counterpartyCollateral,
            totalCollateral: p.totalCollateral,
          });
        }

        // Choose positionId based on position type (which NFT this row represents)
        const positionId = isCounterpartyPosition
          ? Number(p.counterpartyNftTokenId)
          : Number(p.predictorNftTokenId) || p.id;

        // Create unique row key combining prediction id and position type
        const uniqueRowKey = `${p.id}-${isCounterpartyPosition ? 'counterparty' : 'predictor'}-${positionId}`;

        // Compute settlement status from database conditions
        const allConditionsSettled =
          legs.length > 0 && legs.every((leg) => leg.settled === true);

        const predictorWonFromDb = allConditionsSettled
          ? legs.every((leg) => {
              const predictorBet = leg.predictorBetYes;
              const resolved = leg.resolvedToYes;

              return predictorBet === resolved;
            })
          : undefined;

        // Determine opponent address (the other side of the position)
        const opponentAddress = isCounterpartyPosition
          ? ((p.predictor as Address | undefined) ?? null)
          : ((p.counterparty as Address | undefined) ?? null);

        return {
          uniqueRowKey,
          positionId,
          allConditionsSettled,
          predictorWonFromDb,
          legs: legs.map((leg) => {
            // Flip display sides for counterparty positions:
            // - Pyth: predictor prediction is stored; counterparty is opposite
            // - UMA: counterparty is opposite of the predictor's YES/NO
            if (isCounterpartyPosition) {
              if (leg.source === 'pyth' && leg.pythPrediction) {
                const predictorPrediction = Boolean(leg.pythMakerPrediction);
                const displayPrediction = !predictorPrediction; // Counterparty takes opposite
                return {
                  ...leg,
                  choice: displayPrediction ? 'OVER' : 'UNDER',
                  pythPrediction: {
                    ...leg.pythPrediction,
                    direction: displayPrediction ? 'over' : 'under',
                  },
                };
              }

              const upper = String(leg.choice || '').toUpperCase();
              if (upper === 'YES') return { ...leg, choice: 'NO' };
              if (upper === 'NO') return { ...leg, choice: 'YES' };
            }

            if (leg.source === 'pyth' && leg.pythPrediction) {
              // Predictor position: ensure Pyth direction matches predictor side
              const predictorPrediction = Boolean(leg.pythMakerPrediction);
              return {
                ...leg,
                choice: predictorPrediction ? 'OVER' : 'UNDER',
                pythPrediction: {
                  ...leg.pythPrediction,
                  direction: predictorPrediction ? 'over' : 'under',
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
          positionSizeWei,
          pnlWei,
          isCounterpartyPosition,
          opponentAddress,
          predictor: (p.predictor as Address | undefined) ?? null,
          counterparty: (p.counterparty as Address | undefined) ?? null,
          chainId: Number(p.chainId || DEFAULT_CHAIN_ID),
          marketAddress: p.marketAddress as Address,
        };
      };

      return positionTypes.map(buildRowForPositionType);
    });

    return positionRows;
  }, [data, viewer]);

  // Apply client-side filtering (only for filters not handled server-side)
  const filteredRows = React.useMemo(() => {
    let result = rows;

    // Filter by status (client-side only when server can't fully handle it)
    // Server handles: single status, or won+lost combo (both map to "settled")
    // Client still needed: to distinguish won vs lost when server returns "settled"
    if (filters.status.length > 0 && filters.status.length < 3) {
      result = result.filter((row) => filters.status.includes(row.status));
    }

    // Filter by position size range (server doesn't support this)
    if (
      filters.positionSizeRange[0] > 0 ||
      filters.positionSizeRange[1] < Infinity
    ) {
      result = result.filter((row) => {
        const positionSize = Number(formatEther(row.positionSizeWei));
        return (
          positionSize >= filters.positionSizeRange[0] &&
          positionSize <= filters.positionSizeRange[1]
        );
      });
    }

    // Filter by date range (client-side only when server can't handle it)
    // Server handles: "ends in the future" (dateRange[0] >= 0) via endsAtGte
    // Client still needed: upper bound filtering and "ended in the past" scenarios
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      // Skip client-side date filtering if server is handling "ends in the future"
      // and there's no upper bound constraint
      const serverHandlesDate =
        filters.dateRange[0] >= 0 && filters.dateRange[1] === Infinity;
      if (!serverHandlesDate) {
        const nowMs = Date.now();
        result = result.filter((row) => {
          const daysFromNow = (row.endsAt - nowMs) / (1000 * 60 * 60 * 24);
          return (
            daysFromNow >= filters.dateRange[0] &&
            daysFromNow <= filters.dateRange[1]
          );
        });
      }
    }

    // Filter by search term (server doesn't support this)
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter((row) => {
        return row.legs.some((leg) =>
          leg.question.toLowerCase().includes(term)
        );
      });
    }

    return result;
  }, [rows, filters]);

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

  // Keep Share dialog open state outside of row to survive re-renders
  const [openSharePositionId, setOpenSharePositionId] = React.useState<
    number | null
  >(null);
  const selectedPosition = React.useMemo(() => {
    if (openSharePositionId === null) return null;
    return rows.find((r) => r.positionId === openSharePositionId) || null;
  }, [rows, openSharePositionId]);

  // Position dialog state (for "X PICKS" click)
  const [openPositionDialogId, setOpenPositionDialogId] = React.useState<
    number | null
  >(null);
  const selectedPositionForDialog = React.useMemo(() => {
    if (openPositionDialogId === null) return null;
    return rows.find((r) => r.positionId === openPositionDialogId) || null;
  }, [rows, openPositionDialogId]);

  // Find the original Position data to get predictorNftTokenId for sharing
  const selectedPositionData = React.useMemo(() => {
    if (!selectedPosition) return null;
    // Find the original position by matching marketAddress and chainId
    // The positionId in the row might be the NFT ID, so we need to find the position
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
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
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
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const createdAt = row.original.createdAt;
          const timeAgo = formatDistanceToNow(new Date(createdAt), {
            addSuffix: true,
          });
          return (
            <div className="text-sm">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Created
              </div>
              <span className="text-brand-white whitespace-nowrap">
                {timeAgo}
              </span>
            </div>
          );
        },
      },
      {
        id: 'predictions',
        accessorFn: (row) => row.legs.length,
        enableSorting: false,
        header: () => <span className="text-sm font-medium">Predictions</span>,
        cell: ({ row }) => {
          const hasPythLeg = (row.original.legs || []).some(
            (leg) => leg.source === 'pyth'
          );
          return (
            <div className="text-sm">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Predictions
              </div>
              <PicksSummary
                legs={row.original.legs}
                positionId={row.original.positionId}
                isCounterparty={row.original.isCounterpartyPosition}
                hasPythLeg={hasPythLeg}
                marketAddress={row.original.marketAddress}
                onClick={() => setOpenPositionDialogId(row.original.positionId)}
              />
            </div>
          );
        },
      },

      {
        id: 'against',
        accessorFn: (row) => row.opponentAddress ?? '',
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Counterparty
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const addr = row.original.opponentAddress;
          if (!addr) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Counterparty
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-white">
                <EnsAvatar
                  address={addr}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={addr} />
              </span>
            </div>
          );
        },
      },

      {
        id: 'positionSize',
        accessorFn: (row) => Number(formatEther(row.positionSizeWei)),
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Position Size
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = collateralSymbol;
          const positionSize = Number(
            formatEther(row.original.positionSizeWei)
          );

          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Position Size
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <NumberDisplay
                  value={positionSize}
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
        id: 'payout',
        accessorFn: (row) => {
          const totalPayout = Number(formatEther(row.totalPayoutWei || 0n));
          // For sorting, treat lost as 0
          if (row.status === 'lost') return 0;
          return totalPayout;
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Payout
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = collateralSymbol;
          const totalPayout = Number(
            formatEther(row.original.totalPayoutWei || 0n)
          );
          // Determine if this position lost based on settlement
          const positionLostFromDb =
            row.original.allConditionsSettled &&
            (row.original.isCounterpartyPosition
              ? row.original.predictorWonFromDb === true // Counterparty loses when predictor wins
              : row.original.predictorWonFromDb === false); // Predictor loses when predictorWon is false
          if (row.original.status === 'lost' || positionLostFromDb) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  Payout
                </div>
                <div className="whitespace-nowrap tabular-nums text-muted-foreground font-mono line-through">
                  <NumberDisplay
                    value={totalPayout}
                    className="tabular-nums text-muted-foreground font-mono"
                  />{' '}
                  <span className="tabular-nums text-muted-foreground font-mono">
                    {symbol}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Payout
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
          const pnlValue = Number(formatEther(BigInt(row.pnlWei || '0')));
          return pnlValue;
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
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
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = collateralSymbol;
          const isClosed = row.original.status !== 'active';

          // Determine if this position lost based on settlement
          const positionLostFromDb =
            row.original.allConditionsSettled &&
            (row.original.isCounterpartyPosition
              ? row.original.predictorWonFromDb === true // Counterparty loses when predictor wins
              : row.original.predictorWonFromDb === false); // Predictor loses when predictorWon is false
          const lostPositionUnclaimed =
            row.original.status === 'active' && positionLostFromDb;

          // Determine if this position is claimable
          const isClaimable = (() => {
            if (
              row.original.status === 'active' &&
              row.original.endsAt <= Date.now() &&
              row.original.allConditionsSettled
            ) {
              const positionWon = row.original.isCounterpartyPosition
                ? row.original.predictorWonFromDb === false
                : row.original.predictorWonFromDb === true;
              if (positionWon) {
                const tokenId = BigInt(row.original.positionId);
                return { tokenId };
              }
            }
            if (
              row.original.status === 'won' &&
              row.original.tokenIdToClaim !== undefined &&
              claimableTokenIds.has(String(row.original.tokenIdToClaim))
            ) {
              return { tokenId: row.original.tokenIdToClaim };
            }
            return null;
          })();

          if (isClaimable) {
            const isOwnerConnected =
              effectiveAddress &&
              effectiveAddress === String(account || '').toLowerCase();
            const isThisTokenClaiming =
              isClaimPending && claimingTokenId === isClaimable.tokenId;
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  Profit/Loss
                </div>
                {isOwnerConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClaimingTokenId(isClaimable.tokenId);
                      burn(isClaimable.tokenId, ZERO_REF_CODE);
                    }}
                    disabled={isClaimPending}
                    className="font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isThisTokenClaiming ? 'CLAIMING...' : 'CLAIM'}
                  </button>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono font-semibold text-brand-white underline decoration-dotted underline-offset-4 cursor-not-allowed">
                          CLAIM
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
                )}
              </div>
            );
          }

          if (!isClosed && !lostPositionUnclaimed) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  Profit/Loss
                </div>
                <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                  PENDING
                </span>
              </div>
            );
          }

          const positionSize = Number(
            formatEther(row.original.positionSizeWei)
          );

          const pnlValue = lostPositionUnclaimed
            ? -positionSize
            : Number(formatEther(BigInt(row.original.pnlWei || '0')));

          const roi = positionSize > 0 ? (pnlValue / positionSize) * 100 : 0;

          return (
            <div className="relative">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Profit/Loss
              </div>
              <div
                className={`whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                <NumberDisplay
                  value={pnlValue}
                  className={`tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                />{' '}
                <span
                  className={`tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {symbol}
                </span>
                {positionSize > 0 && (
                  <span
                    className={`text-[10px] leading-tight tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {roi >= 0 ? '+' : ''}
                    {Math.round(roi).toLocaleString()}%
                  </span>
                )}
              </div>
            </div>
          );
        },
      },

      {
        id: 'status',
        accessorFn: (row) => {
          if (row.status === 'active' && row.endsAt > Date.now())
            return row.endsAt;
          if (row.status === 'active') return 0;
          if (row.status === 'won') return -1;
          if (row.status === 'lost') return -2;
          return -3;
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Ends
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: ({ row }) => {
          // Helper to format "x days ago" for settled positions
          const endedAgo =
            row.original.endsAt && row.original.endsAt <= Date.now()
              ? formatDistanceToNow(new Date(row.original.endsAt), {
                  addSuffix: true,
                })
              : null;

          const content = (() => {
            if (
              row.original.status === 'active' &&
              row.original.endsAt > Date.now()
            ) {
              return (
                <CountdownCell
                  endTime={Math.floor(row.original.endsAt / 1000)}
                />
              );
            }
            if (
              (row.original.status === 'active' &&
                row.original.endsAt <= Date.now()) ||
              row.original.status === 'won' ||
              row.original.status === 'lost'
            ) {
              return (
                <span className="inline-flex items-center gap-2">
                  {endedAgo && (
                    <span className="text-brand-white text-sm">{endedAgo}</span>
                  )}
                </span>
              );
            }
            return null;
          })();

          return (
            <div className="whitespace-nowrap xl:mt-0">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Ends
              </div>
              {content}
            </div>
          );
        },
      },

      {
        id: 'share',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="whitespace-nowrap mt-6 xl:mt-0 flex justify-start xl:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
              onClick={() => setOpenSharePositionId(row.original.positionId)}
            >
              Share
            </button>
          </div>
        ),
      },
    ],
    [
      isClaimPending,
      burn,
      account,
      claimableTokenIds,
      effectiveAddress,
      hasWallet,
      collateralSymbol,
    ]
  );

  const table = useReactTable({
    data: filteredRows,
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
      {isLoading && rows.length === 0 ? (
        <div className="w-full min-h-[300px] flex items-center justify-center bg-brand-black/80">
          <Loader className="w-6 h-6" />
        </div>
      ) : (
        <>
          <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
            {leftSlot}
            <div className="flex-1">
              <PositionsTableFilters
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
          </div>
          <>
            <div className="overflow-hidden bg-brand-black relative">
              {isLoading && rows.length > 0 && (
                <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-24 bg-brand-black/50 h-full animate-in fade-in duration-150">
                  <Loader className="w-5 h-5" />
                </div>
              )}
              <Table className="w-full table-auto">
                <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={
                            [
                              header.id === 'predictions'
                                ? ''
                                : 'whitespace-nowrap',
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
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="p-0">
                        <EmptyTabState
                          centered
                          message={
                            rows.length === 0
                              ? 'No positions found'
                              : 'No positions match your filters'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top hover:bg-muted/50"
                    >
                      {(() => {
                        const cells = row.getVisibleCells();
                        const pairedIds = new Set([
                          'positionSize',
                          'payout',
                          'pnl',
                          'status',
                        ]);
                        const result: React.ReactNode[] = [];
                        let i = 0;
                        while (i < cells.length) {
                          const cell = cells[i];
                          // Pair positionSize+payout and pnl+ends in a 2-col grid on mobile
                          if (
                            pairedIds.has(cell.column.id) &&
                            i + 1 < cells.length &&
                            pairedIds.has(cells[i + 1].column.id)
                          ) {
                            const next = cells[i + 1];
                            result.push(
                              <TableCell
                                key={cell.id}
                                colSpan={2}
                                className="block xl:hidden px-0 py-0"
                              >
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="text-brand-white whitespace-nowrap">
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext()
                                    )}
                                  </div>
                                  <div className="text-brand-white whitespace-nowrap">
                                    {flexRender(
                                      next.column.columnDef.cell,
                                      next.getContext()
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            );
                            // Also render individually for desktop
                            result.push(
                              <TableCell
                                key={`${cell.id}-xl`}
                                className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            );
                            result.push(
                              <TableCell
                                key={`${next.id}-xl`}
                                className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                              >
                                {flexRender(
                                  next.column.columnDef.cell,
                                  next.getContext()
                                )}
                              </TableCell>
                            );
                            i += 2;
                          } else {
                            result.push(
                              <TableCell
                                key={cell.id}
                                className={`block xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${
                                  cell.column.id !== 'predictions'
                                    ? 'whitespace-nowrap'
                                    : ''
                                }`}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            );
                            i++;
                          }
                        }
                        return result;
                      })()}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Infinite scroll sentinel - triggers auto-load when visible */}
            {hasMore && !(isLoading && rows.length > 0) && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center px-4 py-6 bg-brand-black"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader className="w-3 h-3" />
                    <span className="text-sm text-muted-foreground">
                      Loading more positions...
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-mono uppercase text-muted-foreground tracking-wider">
                    Displaying {data.length} of {totalCount}
                  </span>
                )}
              </div>
            )}
          </>
        </>
      )}
      {selectedPosition && (
        <ShareDialog
          question={`Position #${selectedPosition.positionId}`}
          nftId={
            selectedPosition.isCounterpartyPosition
              ? selectedPositionData?.counterpartyNftTokenId
              : selectedPositionData?.predictorNftTokenId ||
                String(selectedPosition.positionId)
          }
          marketAddress={selectedPosition.marketAddress}
          legs={selectedPosition.legs?.map((l) => ({
            question: l.question,
            choice: l.choice,
          }))}
          positionSize={Number(formatEther(selectedPosition.positionSizeWei))}
          payout={Number(formatEther(selectedPosition.totalPayoutWei || 0n))}
          symbol="USDe"
          owner={String(account)}
          imagePath="/og/position"
          extraParams={{
            ...(selectedPosition.isCounterpartyPosition ? { anti: '1' } : {}),
          }}
          open={openSharePositionId !== null}
          onOpenChange={(next) => {
            if (!next) setOpenSharePositionId(null);
          }}
          trigger={<span />}
          title="Share Your Position"
        />
      )}
      <PositionDialog
        open={openPositionDialogId !== null}
        onOpenChange={(open) => !open && setOpenPositionDialogId(null)}
        position={selectedPositionForDialog}
        collateralSymbol={collateralSymbol}
      />
    </div>
  );
}
