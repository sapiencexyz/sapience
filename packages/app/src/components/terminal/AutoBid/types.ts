export type OrderStrategy = 'copy_trade' | 'conditions';
export type ConditionOutcome = 'yes' | 'no';
export type AutoBidLogKind = 'order' | 'match' | 'system';
export type AutoBidLogSeverity = 'success' | 'warning' | 'error' | 'info';

export type AutoBidLogMeta = Record<string, unknown> & {
  highlight?: string;
  orderId?: string;
  labelSnapshot?: string;
  verb?: string;
  formattedPrefix?: string;
};

export type AutoBidLogEntry = {
  id: string;
  createdAt: string;
  kind: AutoBidLogKind;
  message: string;
  severity: AutoBidLogSeverity;
  meta?: AutoBidLogMeta | null;
};

export type ConditionSelection = {
  id: string;
  outcome: ConditionOutcome;
};

export type OrderStatus = 'active' | 'paused';

export type Order = {
  id: string;
  expiration: string | null;
  autoPausedAt: string | null;
  strategy: OrderStrategy;
  copyTradeAddress?: string;
  increment?: number;
  conditionSelections?: ConditionSelection[];
  odds: number;
  status: OrderStatus;
};

export type OrderDraft = {
  durationValue: string;
  strategy: OrderStrategy;
  copyTradeAddress: string;
  increment: string;
  conditionSelections: ConditionSelection[];
  odds: number;
};

export type AutoBidProps = Record<string, never>;
