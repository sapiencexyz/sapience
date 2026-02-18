import type { AutoBidLogSeverity } from './types';

export const AUTO_BID_STORAGE_KEY = 'sapience:autoBidOrders';
export const AUTO_BID_LOGS_KEY = 'sapience:autoBidLogs';

export const LOG_SEVERITY_CLASSES: Record<AutoBidLogSeverity, string> = {
  success: 'text-emerald-500',
  warning: 'text-amber-300',
  error: 'text-rose-400',
  info: 'text-brand-white/90',
};

export const HOUR_IN_MS = 60 * 60 * 1000;
export const DEFAULT_DURATION_HOURS = '24';
export const DEFAULT_CONDITION_ODDS = 50;
export const EXAMPLE_ODDS_STAKE = 100;
export const AUTO_PAUSE_TICK_MS = 1000;

export const YES_BADGE_BASE_CLASSES =
  'border-green-500/40 bg-green-500/10 text-green-600';
export const YES_BADGE_HOVER_CLASSES =
  'hover:border-green-500/60 hover:bg-green-500/15 hover:text-green-600/90';
export const YES_BADGE_SHADOW = 'shadow-[0_0_0_1px_rgba(34,197,94,0.35)]';

export const NO_BADGE_BASE_CLASSES =
  'border-red-500/40 bg-red-500/10 text-red-600';
export const NO_BADGE_HOVER_CLASSES =
  'hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-600/90';
export const NO_BADGE_SHADOW = 'shadow-[0_0_0_1px_rgba(239,68,68,0.35)]';

export const STRATEGY_LABELS: Record<'conditions' | 'copy_trade', string> = {
  conditions: 'Limit Order',
  copy_trade: 'Copy Trade',
};
