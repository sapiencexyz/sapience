export function formatStrike(strike: number): string {
  if (strike >= 1000) return strike.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (strike >= 1) return strike.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return strike.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatTimeRemaining(expiryTs: number): string {
  const secsLeft = Math.max(0, Math.round(expiryTs - Date.now() / 1000));
  if (secsLeft >= 60) return `${Math.floor(secsLeft / 60)}m`;
  return `${secsLeft}s`;
}

interface LegLabelProps {
  ticker: string;
  isOver: boolean;
  strike?: number;
  expiryTs?: number;
}

export function LegLabel({ ticker, isOver, strike, expiryTs }: LegLabelProps) {
  return (
    <span className="leg-label">
      <span className="leg-ticker">{ticker}</span>
      {' '}
      <span className={isOver ? 'leg-over' : 'leg-under'}>
        {isOver ? 'OVER' : 'UNDER'}
      </span>
      {strike !== undefined && (
        <>
          {' '}
          <span className="leg-strike">{formatStrike(strike)}</span>
        </>
      )}
      {expiryTs !== undefined && expiryTs > 0 && (
        <span className="leg-time"> IN {formatTimeRemaining(expiryTs)}</span>
      )}
    </span>
  );
}
