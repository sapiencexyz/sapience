'use client';

import { useSecondTick } from '~/hooks/useSecondTick';
import CountdownCell from '~/components/shared/CountdownCell';
import ResolutionBadge from '~/components/shared/ResolutionBadge';

/**
 * Renders the full lifecycle status for a condition:
 *  - Settled → "RESOLVED YES" / "RESOLVED NO"
 *  - Past end time but unsettled → "RESOLUTION PENDING"
 *  - Active → live countdown
 *  - No end time → dash
 */
export default function ConditionStatus({
  settled,
  resolvedToYes,
  nonDecisive,
  endTime,
}: {
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  /** Unix timestamp in seconds */
  endTime?: number | null;
}) {
  const nowMs = useSecondTick();

  if (settled) {
    return (
      <ResolutionBadge
        settled
        resolvedToYes={resolvedToYes}
        nonDecisive={nonDecisive}
      />
    );
  }

  if (!endTime) {
    return <span className="text-muted-foreground">—</span>;
  }

  const nowSec =
    nowMs !== null ? Math.floor(nowMs / 1000) : Math.floor(Date.now() / 1000);

  if (endTime <= nowSec) {
    return <ResolutionBadge settled={false} />;
  }

  return <CountdownCell endTime={endTime} />;
}
