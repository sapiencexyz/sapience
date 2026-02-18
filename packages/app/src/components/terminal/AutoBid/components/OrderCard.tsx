import type React from 'react';
import { Clock, Pause, Pencil, Play } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import type { Order, ConditionSelection } from '../types';
import {
  YES_BADGE_BASE_CLASSES,
  YES_BADGE_HOVER_CLASSES,
  YES_BADGE_SHADOW,
  NO_BADGE_BASE_CLASSES,
} from '../constants';
import {
  describeConditionTargeting,
  getStrategyBadgeLabel,
  withAlpha,
} from '../utils';
import { cn, formatFiveSigFigs } from '~/lib/utils/util';
import EnsAvatar from '~/components/shared/EnsAvatar';
import PercentChance from '~/components/shared/PercentChance';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

type OrderCardProps = {
  order: Order;
  index: number;
  collateralSymbol: string;
  conditionLabelById: Record<string, string>;
  conditionCategoryMap: Record<string, string | null>;
  describeAutoPauseStatus: (order: Order) => string;
  onToggleStatus: (id: string) => void;
  onEdit: (order: Order) => void;
};

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  index,
  collateralSymbol,
  conditionLabelById,
  conditionCategoryMap,
  describeAutoPauseStatus,
  onToggleStatus,
  onEdit,
}) => {
  const isActive = order.status === 'active';
  const { numberLabel, strategyLabel } = getStrategyBadgeLabel(order, index);

  const renderConditionSelection = (selection: ConditionSelection) => {
    const categorySlug = conditionCategoryMap[selection.id] ?? undefined;
    const Icon = getCategoryIcon(categorySlug);
    const color = getCategoryStyle(categorySlug)?.color;
    const label = conditionLabelById[selection.id] ?? selection.id;

    return (
      <div
        key={selection.id}
        className="flex w-full items-center gap-2 text-xs"
      >
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0"
          style={{
            backgroundColor: withAlpha(color || 'hsl(var(--muted))', 0.14),
          }}
        >
          <Icon
            className="h-3 w-3"
            style={{
              color: color || 'inherit',
              strokeWidth: 1,
            }}
          />
        </span>
        <span className="font-mono text-xs text-brand-white leading-tight flex-1 min-w-0 break-words">
          {label}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono font-medium border',
            selection.outcome === 'yes'
              ? YES_BADGE_BASE_CLASSES
              : NO_BADGE_BASE_CLASSES
          )}
        >
          {selection.outcome === 'yes' ? 'Yes' : 'No'}
        </span>
      </div>
    );
  };

  return (
    <li className="rounded-md border border-border/60 bg-background p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 w-full">
          <div className="flex w-full items-start gap-2 mb-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] h-6 px-3 inline-flex items-center rounded-full border border-border/60 gap-1.5"
              >
                <span className="font-medium">{numberLabel}</span>
                <span
                  aria-hidden
                  className="h-3.5 w-[2px] rounded-full bg-border/80"
                />
                <span className="text-muted-foreground/80 font-normal tracking-tight">
                  {strategyLabel}
                </span>
              </Badge>
              {order.strategy === 'copy_trade' ? (
                <span className="text-sm font-mono font-normal text-accent-gold">
                  {`+${formatFiveSigFigs(order.increment ?? 0)} ${collateralSymbol}`}
                </span>
              ) : (
                <PercentChance
                  probability={order.odds / 100}
                  showLabel
                  label="chance"
                  className="text-sm font-mono font-normal text-ethena"
                />
              )}
            </div>
            <div className="ml-auto flex items-center justify-end self-start gap-2">
              <button
                type="button"
                onClick={() => onToggleStatus(order.id)}
                className={cn(
                  'group/order-toggle relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  order.status === 'active'
                    ? cn(
                        YES_BADGE_BASE_CLASSES,
                        YES_BADGE_HOVER_CLASSES,
                        YES_BADGE_SHADOW
                      )
                    : cn(
                        'border-border/40 bg-transparent text-muted-foreground/70',
                        YES_BADGE_HOVER_CLASSES
                      )
                )}
                aria-label={
                  order.status === 'active' ? 'Pause order' : 'Resume order'
                }
              >
                <Play
                  className={cn(
                    'h-2.5 w-2.5 transition-all duration-200',
                    isActive
                      ? 'text-green-600 opacity-95 group-hover/order-toggle:text-muted-foreground/80 group-hover/order-toggle:opacity-0'
                      : 'text-green-600 opacity-0 group-hover/order-toggle:opacity-100'
                  )}
                  aria-hidden
                />
                <Pause
                  className={cn(
                    'absolute h-2.5 w-2.5 transition-all duration-200',
                    isActive
                      ? 'text-muted-foreground opacity-0 group-hover/order-toggle:text-muted-foreground group-hover/order-toggle:opacity-100'
                      : 'text-muted-foreground/90 opacity-100 group-hover/order-toggle:text-green-600 group-hover/order-toggle:opacity-0'
                  )}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="inline-flex size-6 items-center justify-center rounded-full border border-border/60 bg-transparent text-muted-foreground transition-colors hover:border-border hover:text-brand-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Edit order"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          {order.strategy === 'copy_trade' ? (
            <>
              {order.copyTradeAddress ? (
                <div className="flex items-center gap-2 py-1.5">
                  <EnsAvatar
                    address={order.copyTradeAddress}
                    width={16}
                    height={16}
                    rounded={false}
                    className="rounded-[3px]"
                  />
                  <AddressDisplay
                    address={order.copyTradeAddress}
                    compact
                    className="text-brand-white [&_.font-mono]:text-brand-white"
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden />
                <span>{describeAutoPauseStatus(order)}</span>
              </div>
            </>
          ) : (
            <>
              {order.conditionSelections &&
              order.conditionSelections.length > 0 ? (
                <div className="space-y-1 py-1.5">
                  {order.conditionSelections.map(renderConditionSelection)}
                </div>
              ) : (
                <p className="py-1.5 text-xs text-muted-foreground">
                  {describeConditionTargeting(order.conditionSelections)}
                </p>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden />
                <span>{describeAutoPauseStatus(order)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
};

export default OrderCard;
