'use client';

import { Loader2 } from 'lucide-react';
import { useBridgeTracker } from '~/lib/bungee';
import { useFundDialog } from '~/lib/context/FundDialogContext';

/**
 * Shows on the balance pill while one or more Bungee bridges are
 * in-flight. Click opens the Fund dialog so the user can see per-bridge
 * status. Hidden when no bridges are pending.
 */
export default function BridgeProgressBadge() {
  const { bridges } = useBridgeTracker();
  const { openFundDialog } = useFundDialog();

  if (bridges.length === 0) return null;

  const label =
    bridges.length === 1
      ? 'Bridge in progress'
      : `${bridges.length} bridges in progress`;

  return (
    <button
      type="button"
      onClick={openFundDialog}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 text-ethena text-xs font-medium hover:opacity-80 transition-opacity"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{bridges.length}</span>
    </button>
  );
}
