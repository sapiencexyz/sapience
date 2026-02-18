'use client';

import type React from 'react';

type ExpiresInLabelProps = {
  secondsRemaining?: number | null;
  endMs?: number;
  nowMs?: number;
  className?: string;
};

const ExpiresInLabel: React.FC<ExpiresInLabelProps> = ({
  secondsRemaining,
  endMs,
  nowMs,
  className,
}) => {
  let secs: number | null | undefined = secondsRemaining;
  if (typeof secs !== 'number' && Number.isFinite(endMs)) {
    const now = Number.isFinite(nowMs) ? (nowMs as number) : Date.now();
    const remain = Math.max(0, Math.round(((endMs as number) - now) / 1000));
    secs = remain;
  }

  if (secs == null) {
    return <span className={className ? className : undefined}>—</span>;
  }
  if (secs <= 0) {
    return (
      <span className={className ? className : undefined}>
        <span className="text-red-600">Expired</span>
      </span>
    );
  }

  return (
    <span className={className ? className : undefined}>
      <span className="text-muted-foreground">expires in </span>
      <span className="font-mono text-brand-white">{secs}s</span>
    </span>
  );
};

export default ExpiresInLabel;
