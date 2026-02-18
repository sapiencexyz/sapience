import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order, OrderDraft, OrderStatus } from '../types';
import { AUTO_PAUSE_TICK_MS } from '../constants';
import { readOrdersFromStorage, writeOrdersToStorage } from '../storage';
import {
  clampConditionOdds,
  createEmptyDraft,
  deriveDurationValueFromExpiration,
  formatOrderLabelSnapshot,
} from '../utils';

type LogOrderEventFn = (
  order: Order,
  action: 'created' | 'updated' | 'deleted' | 'paused' | 'resumed',
  position?: number
) => void;

export function useAutoBidOrders(logOrderEvent: LogOrderEventFn) {
  const [orders, setOrders] = useState<Order[]>([]);
  const hasHydratedOrdersRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  // Hydrate orders from storage on mount
  useEffect(() => {
    const storedOrders = readOrdersFromStorage();
    if (storedOrders.length > 0) {
      setOrders(storedOrders);
    }
    hasHydratedOrdersRef.current = true;
  }, []);

  // Persist orders to storage when they change
  useEffect(() => {
    if (!hasHydratedOrdersRef.current) {
      return;
    }
    writeOrdersToStorage(orders);
  }, [orders]);

  // Auto-pause timer tick
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, AUTO_PAUSE_TICK_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Sorted orders by expiration
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aTime = a.expiration
        ? new Date(a.expiration).getTime()
        : Number.POSITIVE_INFINITY;
      const bTime = b.expiration
        ? new Date(b.expiration).getTime()
        : Number.POSITIVE_INFINITY;
      const safeATime = Number.isFinite(aTime)
        ? aTime
        : Number.POSITIVE_INFINITY;
      const safeBTime = Number.isFinite(bTime)
        ? bTime
        : Number.POSITIVE_INFINITY;
      return safeATime - safeBTime;
    });
  }, [orders]);

  // Order index map for quick lookups
  const orderIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedOrders.forEach((order, index) => map.set(order.id, index));
    return map;
  }, [sortedOrders]);

  const getOrderIndex = useCallback(
    (order: Order) => orderIndexMap.get(order.id) ?? 0,
    [orderIndexMap]
  );

  // Order labels by ID
  const orderLabelById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    sortedOrders.forEach((order, index) => {
      const tag = `#${index + 1}`;
      map[order.id] = formatOrderLabelSnapshot(tag);
    });
    return map;
  }, [sortedOrders]);

  // Auto-pause effect
  useEffect(() => {
    if (orders.length === 0) {
      return;
    }
    let mutated = false;
    const autoPaused: Order[] = [];
    const updated = orders.map((order) => {
      if (order.status === 'active' && order.expiration) {
        const expiresAt = new Date(order.expiration).getTime();
        if (Number.isFinite(expiresAt) && expiresAt <= now) {
          mutated = true;
          const nextOrder: Order = {
            ...order,
            status: 'paused',
            expiration: null,
            autoPausedAt: new Date(now).toISOString(),
          };
          autoPaused.push(nextOrder);
          return nextOrder;
        }
      }
      return order;
    });
    if (mutated) {
      setOrders(updated);
      autoPaused.forEach((order) =>
        logOrderEvent(order, 'paused', getOrderIndex(order))
      );
    }
  }, [getOrderIndex, logOrderEvent, now, orders]);

  const handleDelete = useCallback(
    (id: string) => {
      const target = orders.find((order) => order.id === id);
      const position = target ? getOrderIndex(target) : undefined;
      setOrders((prev) => prev.filter((order) => order.id !== id));
      if (target) {
        logOrderEvent(target, 'deleted', position);
      }
    },
    [getOrderIndex, logOrderEvent, orders]
  );

  const toggleOrderStatus = useCallback(
    (id: string) => {
      const target = orders.find((order) => order.id === id);
      if (!target) {
        return;
      }
      const nextStatus: OrderStatus =
        target.status === 'active' ? 'paused' : 'active';
      const nextOrder: Order = {
        ...target,
        status: nextStatus,
        autoPausedAt: nextStatus === 'active' ? null : target.autoPausedAt,
      };
      const position = getOrderIndex(target);
      setOrders((prev) =>
        prev.map((order) => (order.id === id ? nextOrder : order))
      );
      logOrderEvent(
        nextOrder,
        nextStatus === 'active' ? 'resumed' : 'paused',
        position
      );
    },
    [getOrderIndex, logOrderEvent, orders]
  );

  const createDraftFromOrder = useCallback((order: Order): OrderDraft => {
    const derivedDurationValue = deriveDurationValueFromExpiration(
      order.expiration
    );
    return {
      durationValue: derivedDurationValue,
      strategy: order.strategy,
      copyTradeAddress: order.copyTradeAddress ?? '',
      increment: order.increment != null ? order.increment.toString() : '1',
      conditionSelections: (order.conditionSelections ?? []).map(
        (selection) => ({
          id: selection.id,
          outcome: selection.outcome,
        })
      ),
      odds: clampConditionOdds(order.odds),
    };
  }, []);

  return {
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
    createEmptyDraft,
  };
}
