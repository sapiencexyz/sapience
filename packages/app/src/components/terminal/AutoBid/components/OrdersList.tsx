import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import type { Order } from '../types';
import OrderCard from './OrderCard';
import { cn } from '~/lib/utils/util';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';

export type OrdersListProps = {
  orders: Order[];
  sortedOrders: Order[];
  collateralSymbol: string;
  conditionLabelById: Record<string, string>;
  conditionCategoryMap: Record<string, string | null>;
  describeAutoPauseStatus: (order: Order) => string;
  onToggleStatus: (id: string) => void;
  onEdit: (order: Order) => void;
  onCreateOrder: () => void;
};

const OrdersList: React.FC<OrdersListProps> = ({
  orders,
  sortedOrders,
  collateralSymbol,
  conditionLabelById,
  conditionCategoryMap,
  describeAutoPauseStatus,
  onToggleStatus,
  onEdit,
  onCreateOrder,
}) => {
  const ordersScrollRef = useRef<HTMLDivElement | null>(null);
  const [showOrdersScrollShadow, setShowOrdersScrollShadow] = useState(false);
  const { hasConnectedWallet } = useConnectedWallet();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});

  const handleCreateOrder = useCallback(() => {
    if (!hasConnectedWallet) {
      try {
        connectOrCreateWallet();
      } catch (error) {
        console.error('connectOrCreateWallet failed', error);
      }
      return;
    }
    onCreateOrder();
  }, [hasConnectedWallet, connectOrCreateWallet, onCreateOrder]);

  useEffect(() => {
    const node = ordersScrollRef.current;
    if (!node) {
      return;
    }
    const updateShadow = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      setShowOrdersScrollShadow(scrollHeight - scrollTop - clientHeight > 1);
    };
    updateShadow();
    node.addEventListener('scroll', updateShadow);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateShadow);
      resizeObserver.observe(node);
    }
    return () => {
      node.removeEventListener('scroll', updateShadow);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [orders]);

  return (
    <div className="px-1 flex flex-col flex-1 min-h-0">
      <section className="relative rounded-md py-4 flex-1 min-h-0 flex flex-col bg-muted/5">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Orders</p>
          </div>
          <div className="flex items-center gap-2 self-auto">
            <button
              type="button"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-gold underline decoration-dotted decoration-accent-gold/70 underline-offset-4 transition-colors hover:text-accent-gold/80"
              onClick={handleCreateOrder}
            >
              Create Order
            </button>
          </div>
        </div>
        <div className="relative mt-2 flex-1 min-h-0">
          <div ref={ordersScrollRef} className="h-full overflow-y-auto pr-1">
            {orders.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  className="gold-link"
                >
                  Create an order
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {sortedOrders.map((order, index) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    index={index}
                    collateralSymbol={collateralSymbol}
                    conditionLabelById={conditionLabelById}
                    conditionCategoryMap={conditionCategoryMap}
                    describeAutoPauseStatus={describeAutoPauseStatus}
                    onToggleStatus={onToggleStatus}
                    onEdit={onEdit}
                  />
                ))}
              </ul>
            )}
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-md bg-gradient-to-t from-brand-black/80 via-brand-black/40 to-transparent transition-opacity duration-200',
              showOrdersScrollShadow ? 'opacity-100' : 'opacity-0'
            )}
          />
        </div>
      </section>
    </div>
  );
};

export default OrdersList;
