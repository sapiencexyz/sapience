'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { Clock, HelpCircle, Info, X } from 'lucide-react';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import type {
  Order,
  OrderDraft,
  OrderStrategy,
  ConditionOutcome,
} from '../types';
import {
  HOUR_IN_MS,
  DEFAULT_DURATION_HOURS,
  EXAMPLE_ODDS_STAKE,
  YES_BADGE_BASE_CLASSES,
  YES_BADGE_HOVER_CLASSES,
  YES_BADGE_SHADOW,
  NO_BADGE_BASE_CLASSES,
  NO_BADGE_HOVER_CLASSES,
  NO_BADGE_SHADOW,
  STRATEGY_LABELS,
} from '../constants';
import { clampConditionOdds, createEmptyDraft, withAlpha } from '../utils';
import { cn } from '~/lib/utils/util';
import { formatPercentChance } from '~/lib/format/percentChance';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionsFilter from '~/components/terminal/filters/ConditionsFilter';
import type { MultiSelectItem } from '~/components/terminal/filters/MultiSelect';
import ForecastOddsSlider from '~/components/shared/ForecastOddsSlider';

type OrderBuilderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  initialDraft: OrderDraft;
  orders: Order[];
  sortedOrders: Order[];
  collateralSymbol: string;
  conditionItems: MultiSelectItem[];
  conditionLabelById: Record<string, string>;
  conditionCategoryMap: Record<string, string | null>;
  getOrderIndex: (order: Order) => number;
  onSubmit: (order: Order) => void;
  onDelete: (id: string) => void;
};

const OrderBuilderDialog: React.FC<OrderBuilderDialogProps> = ({
  open,
  onOpenChange,
  editingId,
  initialDraft,
  orders,
  sortedOrders: _sortedOrders,
  collateralSymbol,
  conditionItems,
  conditionLabelById,
  conditionCategoryMap,
  getOrderIndex: _getOrderIndex,
  onSubmit,
  onDelete,
}) => {
  const [draft, setDraft] = useState<OrderDraft>(() => initialDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDurationExpanded, setIsDurationExpanded] = useState(false);
  const [isPayoutPopoverOpen, setIsPayoutPopoverOpen] = useState(false);
  const [examplePayoutInput, setExamplePayoutInput] = useState('');
  const [isOddsPopoverOpen, setIsOddsPopoverOpen] = useState(false);
  const [oddsPercentInput, setOddsPercentInput] = useState('');

  // Reset draft when dialog opens or initialDraft changes
  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
      setFormError(null);
      setIsDurationExpanded(Boolean(initialDraft.durationValue.trim()));
    }
  }, [open, initialDraft]);

  const isExamplePayoutInputValid = useMemo(() => {
    const parsed = Number(examplePayoutInput);
    return Number.isFinite(parsed) && parsed >= 100;
  }, [examplePayoutInput]);

  const isOddsPercentInputValid = useMemo(() => {
    const parsed = Number(oddsPercentInput);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 99;
  }, [oddsPercentInput]);

  const examplePayout = useMemo(() => {
    const odds = clampConditionOdds(draft.odds);
    if (odds <= 0) return null;
    return (EXAMPLE_ODDS_STAKE * 100) / odds;
  }, [draft.odds]);

  useEffect(() => {
    if (isPayoutPopoverOpen) {
      const fallback = 100;
      const normalized =
        examplePayout == null || !Number.isFinite(examplePayout)
          ? fallback
          : Math.max(examplePayout, fallback);
      setExamplePayoutInput(normalized.toFixed(2));
    }
  }, [isPayoutPopoverOpen, examplePayout]);

  useEffect(() => {
    if (isOddsPopoverOpen) {
      const currentOdds = clampConditionOdds(draft.odds);
      setOddsPercentInput(String(currentOdds));
    }
  }, [isOddsPopoverOpen, draft.odds]);

  const parsedIncrement = useMemo(() => {
    const next = Number(draft.increment);
    return Number.isFinite(next) ? next : NaN;
  }, [draft.increment]);

  const parsedDurationMs = useMemo(() => {
    const raw = draft.durationValue.trim();
    if (raw.length === 0) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return numeric * HOUR_IN_MS;
  }, [draft.durationValue]);

  const hasDurationValue = draft.durationValue.trim().length > 0;
  const showDurationFields = isDurationExpanded || hasDurationValue;

  const trimmedCopyTradeAddress = draft.copyTradeAddress.trim();

  const isCopyTradeValid =
    draft.strategy !== 'copy_trade' ||
    (trimmedCopyTradeAddress.length > 0 &&
      isAddress(trimmedCopyTradeAddress as `0x${string}`) &&
      Number.isFinite(parsedIncrement) &&
      parsedIncrement > 0);

  const isConditionsValid =
    draft.strategy !== 'conditions' || draft.conditionSelections.length > 0;

  const isDurationValid = parsedDurationMs !== undefined;

  const isFormValid = isDurationValid && isCopyTradeValid && isConditionsValid;

  type DraftUpdater = Partial<OrderDraft> | ((prev: OrderDraft) => OrderDraft);

  const updateDraft = (updates: DraftUpdater) => {
    setDraft((prev) => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
    setFormError(null);
  };

  const enableDurationFields = () => {
    setIsDurationExpanded(true);
    updateDraft((prev) => {
      if (prev.durationValue.trim().length > 0) {
        return prev;
      }
      return { ...prev, durationValue: DEFAULT_DURATION_HOURS };
    });
  };

  const clearDurationFields = () => {
    setIsDurationExpanded(false);
    updateDraft({
      durationValue: '',
    });
  };

  const handleConditionPickerChange = (values: string[]) => {
    updateDraft((prev) => ({
      ...prev,
      conditionSelections: values.map((value) => {
        const existing = prev.conditionSelections.find(
          (selection) => selection.id === value
        );
        if (existing) {
          return { ...existing };
        }
        return {
          id: value,
          outcome: 'yes' as const,
        };
      }),
    }));
  };

  const handleConditionOutcomeChange = (
    conditionId: string,
    outcome: ConditionOutcome
  ) => {
    updateDraft((prev) => {
      let nextOdds = prev.odds;
      const nextSelections = prev.conditionSelections.map((selection) => {
        if (selection.id !== conditionId) {
          return selection;
        }
        if (
          prev.conditionSelections.length === 1 &&
          selection.outcome !== outcome
        ) {
          nextOdds = clampConditionOdds(100 - prev.odds);
        }
        return { ...selection, outcome };
      });
      return {
        ...prev,
        conditionSelections: nextSelections,
        odds: nextOdds,
      };
    });
  };

  const handleOrderOddsChange = (odds: number) => {
    updateDraft({ odds: clampConditionOdds(odds) });
  };

  const applyExamplePayoutInput = () => {
    const parsed = Number(examplePayoutInput);
    if (!Number.isFinite(parsed) || parsed < 100) {
      return;
    }
    const nextOdds = Math.round((EXAMPLE_ODDS_STAKE * 100) / parsed);
    handleOrderOddsChange(clampConditionOdds(nextOdds));
    setIsPayoutPopoverOpen(false);
  };

  const applyOddsPercentInput = () => {
    const parsed = Number(oddsPercentInput);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 99) {
      return;
    }
    handleOrderOddsChange(clampConditionOdds(Math.round(parsed)));
    setIsOddsPopoverOpen(false);
  };

  const handleConditionRemove = (conditionId: string) => {
    updateDraft((prev) => ({
      ...prev,
      conditionSelections: prev.conditionSelections.filter(
        (selection) => selection.id !== conditionId
      ),
    }));
  };

  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
    setFormError(null);
    setIsDurationExpanded(false);
  }, []);

  const handleBuilderOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetDraft();
    }
  };

  const handleDeleteClick = () => {
    if (editingId) {
      onDelete(editingId);
      onOpenChange(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsedDurationMs === undefined) {
      setFormError('Duration must be greater than zero.');
      return;
    }

    if (draft.strategy === 'copy_trade') {
      if (trimmedCopyTradeAddress.length === 0) {
        setFormError('Enter the address you want to copy.');
        return;
      }
      if (!isAddress(trimmedCopyTradeAddress as `0x${string}`)) {
        setFormError('Enter a valid Ethereum address.');
        return;
      }
      if (!Number.isFinite(parsedIncrement) || parsedIncrement <= 0) {
        setFormError('Increment must be greater than zero.');
        return;
      }
    }

    if (
      draft.strategy === 'conditions' &&
      draft.conditionSelections.length === 0
    ) {
      setFormError('Select at least one prediction.');
      return;
    }

    if (!isFormValid) {
      setFormError('Please complete the form.');
      return;
    }

    const expirationTimestamp =
      typeof parsedDurationMs === 'number'
        ? new Date(Date.now() + parsedDurationMs).toISOString()
        : null;

    const existingOrder = editingId
      ? orders.find((order) => order.id === editingId)
      : undefined;

    const nextOrder: Order = {
      id:
        editingId ??
        `order-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      expiration: expirationTimestamp,
      autoPausedAt:
        typeof parsedDurationMs === 'number'
          ? null
          : (existingOrder?.autoPausedAt ?? null),
      strategy: draft.strategy,
      copyTradeAddress:
        draft.strategy === 'copy_trade' ? trimmedCopyTradeAddress : undefined,
      increment: draft.strategy === 'copy_trade' ? parsedIncrement : undefined,
      conditionSelections:
        draft.strategy === 'conditions' ? draft.conditionSelections : undefined,
      odds: clampConditionOdds(draft.odds),
      status: editingId
        ? (orders.find((order) => order.id === editingId)?.status ?? 'active')
        : 'active',
    };

    onSubmit(nextOrder);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleBuilderOpenChange}>
      <DialogContent className="border border-border/60 bg-brand-black text-brand-white sm:max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit Order' : 'Create Order'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Orders only execute while this app is running.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label>Strategy</Label>
            <div className="inline-flex w-full gap-1 rounded-md border border-border/60 bg-muted/10 p-1">
              {(Object.keys(STRATEGY_LABELS) as OrderStrategy[]).map(
                (strategy) => {
                  const isActive = draft.strategy === strategy;
                  return (
                    <Button
                      key={strategy}
                      type="button"
                      size="xs"
                      variant={isActive ? 'default' : 'ghost'}
                      className="flex-1"
                      aria-pressed={isActive}
                      onClick={() => updateDraft({ strategy })}
                    >
                      {STRATEGY_LABELS[strategy]}
                    </Button>
                  );
                }
              )}
            </div>
            {draft.strategy === 'copy_trade' ? (
              <p className="text-sm text-muted-foreground mt-1.5">
                Automatically out-bid other accounts. You can explore the{' '}
                <a
                  href="/leaderboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-white underline decoration-dotted underline-offset-2 hover:text-brand-white/80"
                >
                  leaderboard
                </a>{' '}
                for accounts with recently created <em>counterparty</em>{' '}
                positions.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1.5">
                Offer odds to{' '}
                <a
                  href="/markets"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-white underline decoration-dotted underline-offset-2 hover:text-brand-white/80"
                >
                  prediction market
                </a>{' '}
                traders. These orders may be filled multiple times.
              </p>
            )}
          </div>

          {draft.strategy === 'copy_trade' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="copy-trade-address" className="text-sm">
                    Account Address
                  </Label>
                  <Input
                    id="copy-trade-address"
                    placeholder="0x..."
                    value={draft.copyTradeAddress}
                    onChange={(event) =>
                      updateDraft({ copyTradeAddress: event.target.value })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Wallet to automatically out-bid
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="copy-trade-increment" className="text-sm">
                    Increment
                  </Label>
                  <div className="flex">
                    <Input
                      id="copy-trade-increment"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={draft.increment}
                      onChange={(event) =>
                        updateDraft({ increment: event.target.value })
                      }
                      className="rounded-r-none border-r-0 flex-1"
                    />
                    <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-3 text-xs text-muted-foreground ml-[-1px]">
                      {collateralSymbol}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Amount to add to copied bid
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Label className="text-sm">Predictions</Label>
              <ConditionsFilter
                items={conditionItems}
                selected={draft.conditionSelections.map(
                  (selection) => selection.id
                )}
                onChange={handleConditionPickerChange}
                categoryById={conditionCategoryMap}
                placeholder="Select question..."
                alwaysShowPlaceholder
                size="default"
                matchTriggerWidth
                closeOnSelect
              />
              {draft.conditionSelections.length > 0 ? (
                <>
                  <Label className="mt-2 text-xs font-medium text-muted-foreground">
                    {draft.conditionSelections.length === 1
                      ? 'Selected Prediction'
                      : 'Selected Predictions'}
                  </Label>
                  <ul className="mt-1 space-y-2">
                    {draft.conditionSelections.map((selection) => {
                      const label =
                        conditionLabelById[selection.id] ??
                        `Unknown condition (${selection.id.slice(0, 8)}…)`;
                      const slug = conditionCategoryMap[selection.id] ?? null;
                      const Icon = getCategoryIcon(slug ?? undefined);
                      const color = getCategoryStyle(slug)?.color;
                      return (
                        <li
                          key={selection.id}
                          className="rounded-md border border-border/60 bg-background p-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex items-center justify-center rounded-full shrink-0"
                                  style={{
                                    width: 22,
                                    height: 22,
                                    minWidth: 22,
                                    minHeight: 22,
                                    backgroundColor: withAlpha(
                                      color || 'hsl(var(--muted))',
                                      0.14
                                    ),
                                  }}
                                >
                                  <Icon
                                    className="h-3 w-3"
                                    style={{ strokeWidth: 1, color }}
                                  />
                                </span>
                                <span className="font-mono text-xs text-brand-white break-words leading-tight">
                                  {label}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                              <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                  type="button"
                                  aria-pressed={selection.outcome === 'yes'}
                                  onClick={() =>
                                    handleConditionOutcomeChange(
                                      selection.id,
                                      'yes'
                                    )
                                  }
                                  className={cn(
                                    'flex-1 min-w-[42px] inline-flex items-center justify-center rounded-sm border px-2 text-[10px] font-mono leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-6',
                                    selection.outcome === 'yes'
                                      ? cn(
                                          YES_BADGE_BASE_CLASSES,
                                          YES_BADGE_HOVER_CLASSES,
                                          YES_BADGE_SHADOW
                                        )
                                      : cn(
                                          'border-border/60 text-muted-foreground',
                                          YES_BADGE_HOVER_CLASSES
                                        )
                                  )}
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={selection.outcome === 'no'}
                                  onClick={() =>
                                    handleConditionOutcomeChange(
                                      selection.id,
                                      'no'
                                    )
                                  }
                                  className={cn(
                                    'flex-1 min-w-[42px] inline-flex items-center justify-center rounded-sm border px-2 text-[10px] font-mono leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-6',
                                    selection.outcome === 'no'
                                      ? cn(
                                          NO_BADGE_BASE_CLASSES,
                                          NO_BADGE_HOVER_CLASSES,
                                          NO_BADGE_SHADOW
                                        )
                                      : cn(
                                          'border-border/60 text-muted-foreground',
                                          NO_BADGE_HOVER_CLASSES
                                        )
                                  )}
                                >
                                  No
                                </button>
                              </div>
                              <button
                                type="button"
                                aria-label="Remove selection"
                                onClick={() =>
                                  handleConditionRemove(selection.id)
                                }
                                className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground transition-opacity hover:opacity-80 self-start sm:self-auto shrink-0"
                              >
                                <X className="h-4 w-4" />
                                <span className="sr-only">
                                  Remove selection
                                </span>
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {draft.conditionSelections.length > 1 ? (
                    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Info
                        className="mt-[1px] h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
                        aria-hidden
                      />
                      <span>
                        This will only execute if all of these predictions are
                        requested together. You win if any of these predictions
                        are correct.
                      </span>
                    </p>
                  ) : null}
                  <ForecastOddsSlider
                    className="mt-4"
                    value={draft.odds}
                    onChange={handleOrderOddsChange}
                    label="Odds"
                    renderHeader={(safeValue) => {
                      const payout =
                        safeValue > 0
                          ? (EXAMPLE_ODDS_STAKE * 100) / safeValue
                          : null;
                      const payoutDisplay =
                        payout != null && Number.isFinite(payout)
                          ? payout.toFixed(2)
                          : '—';
                      return (
                        <div className="flex items-end justify-between gap-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-tight text-muted-foreground">
                              <span>Odds</span>
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label="Odds help"
                                      className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border rounded-sm"
                                    >
                                      <HelpCircle
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="start"
                                    className="max-w-[220px] text-xs"
                                  >
                                    Orders with higher odds are more likely to
                                    be processed
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Popover
                              open={isOddsPopoverOpen}
                              onOpenChange={setIsOddsPopoverOpen}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="font-mono text-sm font-light text-ethena leading-tight underline decoration-dotted decoration-ethena/60 underline-offset-2 hover:text-ethena/80 hover:decoration-ethena/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border rounded-sm"
                                >
                                  {formatPercentChance(safeValue / 100)} chance
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="w-48 p-2"
                              >
                                <div className="flex flex-col gap-1.5">
                                  <Label className="text-xs">Odds</Label>
                                  <div className="flex">
                                    <Input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={oddsPercentInput}
                                      onChange={(event) =>
                                        setOddsPercentInput(
                                          event.target.value.trim()
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          applyOddsPercentInput();
                                        }
                                      }}
                                      placeholder="10"
                                      inputMode="decimal"
                                      className="h-8 text-sm rounded-r-none border-r-0 flex-1"
                                    />
                                    <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-2 text-xs text-muted-foreground whitespace-nowrap">
                                      % chance
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="xs"
                                    className="w-full mt-2"
                                    disabled={!isOddsPercentInputValid}
                                    onClick={applyOddsPercentInput}
                                  >
                                    Update Odds
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-mono uppercase tracking-tight text-muted-foreground">
                              100 USDe payout
                            </p>
                            <Popover
                              open={isPayoutPopoverOpen}
                              onOpenChange={setIsPayoutPopoverOpen}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="font-mono text-sm text-brand-white underline decoration-dotted decoration-brand-white underline-offset-2 hover:text-brand-white/80 hover:decoration-brand-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
                                >
                                  {payoutDisplay} USDe
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-48 p-2">
                                <div className="flex flex-col gap-1.5">
                                  <Label className="text-xs">
                                    Example <em>Payout</em> Amount
                                  </Label>
                                  <div className="flex">
                                    <Input
                                      type="number"
                                      min={100}
                                      value={examplePayoutInput}
                                      onChange={(event) =>
                                        setExamplePayoutInput(
                                          event.target.value.trim()
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          applyExamplePayoutInput();
                                        }
                                      }}
                                      placeholder="0.00"
                                      inputMode="decimal"
                                      className="h-8 text-sm rounded-r-none border-r-0 flex-1"
                                    />
                                    <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-2 text-xs text-muted-foreground">
                                      USDe
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="xs"
                                    className="w-full mt-2"
                                    disabled={!isExamplePayoutInputValid}
                                    onClick={applyExamplePayoutInput}
                                  >
                                    Update Odds
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      );
                    }}
                  />
                </>
              ) : null}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {showDurationFields ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="order-duration" className="text-sm">
                    Time until auto-pause
                  </Label>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex">
                    <Input
                      id="order-duration"
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      placeholder="24"
                      value={draft.durationValue}
                      onChange={(event) =>
                        updateDraft({ durationValue: event.target.value })
                      }
                      className="rounded-r-none border-r-0 flex-1"
                    />
                    <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-3 text-xs tracking-wide text-muted-foreground ml-[-1px]">
                      hours
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <button
                      type="button"
                      onClick={clearDurationFields}
                      className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Remove Expiration
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex w-full items-center justify-between">
                <button
                  type="button"
                  onClick={enableDurationFields}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-white underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-80"
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Set Expiration
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="text-[11px] font-mono uppercase tracking-[0.2em] text-rose-400 underline decoration-dotted underline-offset-4 transition-colors hover:text-rose-400/80"
                  >
                    Cancel Order
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {formError ? (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          <DialogFooter className="flex flex-col gap-2">
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!isFormValid}
            >
              {editingId ? 'Update Order' : 'Add Order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OrderBuilderDialog;
