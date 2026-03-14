'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import {
  predictionMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useConditions } from '~/hooks/graphql/useConditions';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { useTerminalLogs } from '~/components/terminal/TerminalLogsContext';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import { useEscrowBidSubmission } from '~/hooks/auction';
import type { MultiSelectItem } from '~/components/terminal/filters/MultiSelect';

import type { AutoBidProps, Order, OrderDraft } from './types';
import { DEFAULT_CONDITION_ODDS } from './constants';
import {
  formatTimeRemaining,
  formatOrderTag,
  formatOrderLabelSnapshot,
} from './utils';
import { useAutoBidOrders } from './hooks/useAutoBidOrders';
import { useAuctionMatching } from './hooks/useAuctionMatching';
import AutoBidHeader from './components/AutoBidHeader';
import OrdersList from './components/OrdersList';
import LogsPanel from './components/LogsPanel';
import OrderBuilderDialog from './components/OrderBuilderDialog';

// Max display threshold - if allowance exceeds 1 billion tokens, cap the display
const MAX_DISPLAY_ALLOWANCE = 10n ** 27n; // 1 billion tokens (10^9) with 18 decimals

const AutoBid: React.FC<AutoBidProps> = () => {
  const { address } = useAccount();
  const chainId = DEFAULT_CHAIN_ID;
  const { messages: auctionMessages } = useAuctionRelayerFeed();
  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  const {
    balance,
    symbol: collateralSymbol,
    decimals: tokenDecimals,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address,
    chainId,
    enabled: Boolean(address),
  });

  // Always use PredictionMarketEscrow
  const SPENDER_ADDRESS = predictionMarketEscrow[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Collateral token address from SDK
  const COLLATERAL_ADDRESS = collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;

  const { openApproval } = useApprovalDialog();
  const [spenderAddressInput] = useState<string>(
    (SPENDER_ADDRESS as string | undefined) ?? ''
  );

  // Dialog state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<OrderDraft>({
    durationValue: '',
    strategy: 'conditions',
    copyTradeAddress: '',
    increment: '1',
    conditionSelections: [],
    odds: DEFAULT_CONDITION_ODDS,
  });

  const { data: conditionCatalog = [] } = useConditions({
    take: 100,
    chainId: chainId || undefined,
  });

  const activeConditionCatalog = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return (conditionCatalog || []).filter((condition) => {
      if (typeof condition?.endTime !== 'number') return false;
      return condition.endTime > nowSeconds;
    });
  }, [conditionCatalog]);

  const { allowance, refetchAllowance } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: (spenderAddressInput || SPENDER_ADDRESS) as
      | `0x${string}`
      | undefined,
    amount: '',
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(
      COLLATERAL_ADDRESS && (spenderAddressInput || SPENDER_ADDRESS)
    ),
  });

  // Refresh balance and allowance every 10 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchBalance();
      refetchAllowance();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [refetchBalance, refetchAllowance]);

  const allowanceValue = useMemo(() => {
    try {
      if (allowance == null) return 0;
      const allowanceBigInt = allowance as unknown as bigint;
      // Cap at a reasonable display value to avoid JS Number precision issues
      if (allowanceBigInt >= MAX_DISPLAY_ALLOWANCE) {
        return Infinity;
      }
      return Number(formatUnits(allowanceBigInt, tokenDecimals));
    } catch {
      return 0;
    }
  }, [allowance, tokenDecimals]);

  const formatCollateralAmount = useCallback(
    (value?: string | null) => {
      if (!value) {
        return null;
      }
      try {
        const human = Number(formatUnits(BigInt(value), tokenDecimals));
        return human.toFixed(2);
      } catch {
        return null;
      }
    },
    [tokenDecimals]
  );

  // Logs from shared context
  const { logs, pushLogEntry, setOrderLabelById } = useTerminalLogs();

  // Bid submission hook for auto-bid signing and WebSocket submission
  const { submitBid } = useEscrowBidSubmission();

  // Ref to hold current orderIndexMap to avoid circular dependency
  // (logOrderEvent is passed to useAutoBidOrders which returns orderIndexMap)
  const orderIndexMapRef = useRef<Map<string, number>>(new Map());

  // Log order event callback
  const logOrderEvent = useCallback(
    (
      order: Order,
      action: 'created' | 'updated' | 'deleted' | 'paused' | 'resumed',
      position?: number
    ) => {
      const actionLabels: Record<typeof action, string> = {
        created: 'Created',
        updated: 'Updated',
        deleted: 'Cancelled',
        paused: 'Paused',
        resumed: 'Resumed',
      };
      const tag = formatOrderTag(
        order,
        position,
        (o) => orderIndexMapRef.current.get(o.id) ?? 0
      );
      const verb = actionLabels[action].toLowerCase();
      pushLogEntry({
        kind: 'order',
        message: `${tag} ${verb}`,
        meta: {
          orderId: order.id,
          labelSnapshot: formatOrderLabelSnapshot(tag),
          formattedPrefix: tag,
          verb,
          highlight: verb,
          action,
          strategy: order.strategy,
        },
      });
    },
    [pushLogEntry]
  );

  // Orders hook
  const {
    orders,
    setOrders,
    sortedOrders,
    orderIndexMap,
    getOrderIndex,
    orderLabelById,
    now,
    handleDelete,
    toggleOrderStatus,
    createDraftFromOrder,
  } = useAutoBidOrders(logOrderEvent);

  // Keep ref in sync with current orderIndexMap
  useEffect(() => {
    orderIndexMapRef.current = orderIndexMap;
  }, [orderIndexMap]);

  // Sync order labels to shared context for log display
  // Use a ref to track the previous value and only update if content changed
  const prevOrderLabelByIdRef = useRef<Record<string, string>>({});
  useEffect(() => {
    // Shallow compare to avoid unnecessary context updates that could cause re-render loops
    const prevKeys = Object.keys(prevOrderLabelByIdRef.current);
    const nextKeys = Object.keys(orderLabelById);
    const hasChanged =
      prevKeys.length !== nextKeys.length ||
      nextKeys.some(
        (key) => prevOrderLabelByIdRef.current[key] !== orderLabelById[key]
      );
    if (hasChanged) {
      prevOrderLabelByIdRef.current = orderLabelById;
      setOrderLabelById(orderLabelById);
    }
  }, [orderLabelById, setOrderLabelById]);

  // Auction matching hook
  useAuctionMatching({
    orders,
    getOrderIndex,
    pushLogEntry,
    balanceValue: balance,
    allowanceValue,
    isPermitLoading,
    isRestricted,
    address,
    collateralSymbol,
    tokenDecimals,
    auctionMessages,
    formatCollateralAmount,
    submitBid,
    predictionMarketAddress: SPENDER_ADDRESS,
    collateralTokenAddress: COLLATERAL_ADDRESS,
    chainId,
  });

  const conditionItems = useMemo<MultiSelectItem[]>(() => {
    return activeConditionCatalog.map((condition) => ({
      value: condition.id,
      label: (condition.question as string | undefined) || condition.id,
    }));
  }, [activeConditionCatalog]);

  const conditionLabelById = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      (conditionCatalog || []).map((condition) => [
        condition.id,
        (condition.question as string | undefined) || condition.id,
      ])
    );
  }, [conditionCatalog]);

  const conditionCategoryMap = useMemo<Record<string, string | null>>(() => {
    return Object.fromEntries(
      (conditionCatalog || []).map((condition) => [
        condition.id,
        condition?.category?.slug ?? null,
      ])
    );
  }, [conditionCatalog]);

  const describeAutoPauseStatus = useCallback(
    (order: Order) => {
      if (!order.expiration) {
        return 'No expiration set';
      }
      const expiresAt = new Date(order.expiration).getTime();
      if (!Number.isFinite(expiresAt)) {
        return 'No expiration set';
      }
      const remainingMs = expiresAt - now;
      if (remainingMs <= 0) {
        return 'Auto-pausing...';
      }
      return `${formatTimeRemaining(remainingMs)} until auto-pause`;
    },
    [now]
  );

  const handleEdit = useCallback(
    (order: Order) => {
      const draft = createDraftFromOrder(order);
      setInitialDraft(draft);
      setEditingId(order.id);
      setIsBuilderOpen(true);
    },
    [createDraftFromOrder]
  );

  const handleCreateOrder = useCallback(() => {
    setInitialDraft({
      durationValue: '',
      strategy: 'conditions',
      copyTradeAddress: '',
      increment: '1',
      conditionSelections: [],
      odds: DEFAULT_CONDITION_ODDS,
    });
    setEditingId(null);
    setIsBuilderOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsBuilderOpen(open);
    if (!open) {
      setEditingId(null);
    }
  }, []);

  const handleOrderSubmit = useCallback(
    (order: Order) => {
      const existingOrder = editingId
        ? orders.find((o) => o.id === editingId)
        : undefined;
      const position =
        editingId && existingOrder
          ? getOrderIndex(existingOrder)
          : sortedOrders.length;

      setOrders((prev) =>
        editingId
          ? prev.map((o) => (o.id === editingId ? order : o))
          : [...prev, order]
      );

      logOrderEvent(order, editingId ? 'updated' : 'created', position);
    },
    [
      editingId,
      getOrderIndex,
      logOrderEvent,
      orders,
      setOrders,
      sortedOrders.length,
    ]
  );

  const handleOrderDelete = useCallback(
    (id: string) => {
      handleDelete(id);
    },
    [handleDelete]
  );

  return (
    <div className="border border-border/60 rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0 overflow-hidden">
      <div className="pl-4 pr-3 h-[57px] border-b border-border/60 bg-muted/10 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="eyebrow text-foreground">Auto-Bid</div>
          <span className="font-mono text-[10px] leading-none text-accent-gold tracking-[0.18em] inline-flex items-center">
            EXPERIMENTAL
          </span>
        </div>
      </div>
      <div className="pl-3 pr-4 py-4 sm:pl-4 flex-1 min-h-0 flex flex-col">
        <AutoBidHeader
          allowanceValue={allowanceValue}
          balanceValue={balance}
          collateralSymbol={collateralSymbol}
          onOpenApproval={openApproval}
        />

        <div className="flex flex-col flex-1 min-h-0 gap-2">
          <OrdersList
            orders={orders}
            sortedOrders={sortedOrders}
            collateralSymbol={collateralSymbol}
            conditionLabelById={conditionLabelById}
            conditionCategoryMap={conditionCategoryMap}
            describeAutoPauseStatus={describeAutoPauseStatus}
            onToggleStatus={toggleOrderStatus}
            onEdit={handleEdit}
            onCreateOrder={handleCreateOrder}
          />

          <LogsPanel logs={logs} orderLabelById={orderLabelById} />
        </div>
      </div>

      <OrderBuilderDialog
        open={isBuilderOpen}
        onOpenChange={handleDialogOpenChange}
        editingId={editingId}
        initialDraft={initialDraft}
        orders={orders}
        sortedOrders={sortedOrders}
        collateralSymbol={collateralSymbol}
        conditionItems={conditionItems}
        conditionLabelById={conditionLabelById}
        conditionCategoryMap={conditionCategoryMap}
        getOrderIndex={getOrderIndex}
        onSubmit={handleOrderSubmit}
        onDelete={handleOrderDelete}
      />
    </div>
  );
};

export default AutoBid;
