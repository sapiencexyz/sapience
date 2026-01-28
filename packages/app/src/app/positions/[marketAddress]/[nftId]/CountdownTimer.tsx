'use client';

import { useSecondTick } from '~/hooks/useSecondTick';
import { formatCountdown } from '~/lib/utils/formatCountdown';

export default function CountdownTimer({ endsAtMs }: { endsAtMs: number }) {
  const nowMs = useSecondTick();

  if (nowMs === null) return <span className="text-muted-foreground">—</span>;

  const diff = endsAtMs - nowMs;
  if (diff <= 0) return <span className="text-muted-foreground">Ended</span>;

  return (
    <span title={new Date(endsAtMs).toLocaleString()}>
      {formatCountdown(diff)}
    </span>
  );
}
