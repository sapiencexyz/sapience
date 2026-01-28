'use client';

import { useEffect, useState } from 'react';

export default function CountdownTimer({ endsAtMs }: { endsAtMs: number }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (nowMs === null) return <span className="text-muted-foreground">—</span>;

  const diff = endsAtMs - nowMs;
  if (diff <= 0) return <span className="text-muted-foreground">Ended</span>;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const h = hours % 24;
  const m = minutes % 60;
  const s = seconds % 60;

  let text: string;
  if (days > 0) text = `${days}d ${h}h ${m}m`;
  else if (hours > 0) text = `${h}h ${m}m ${s}s`;
  else if (minutes > 0) text = `${m}m ${s}s`;
  else text = `${s}s`;

  return <span title={new Date(endsAtMs).toLocaleString()}>{text}</span>;
}
