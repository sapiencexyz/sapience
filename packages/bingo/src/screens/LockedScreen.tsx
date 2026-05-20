import { useMemo, useState } from 'react';
import type { Tier } from '../App';
import type { BingoCondition } from '../api';
import type { Side } from './CardScreen';
import { buildLines, computeLinePayout } from '../parlay';
import type { LineProgress } from '~/lib/submitCard';

function cellLabel(c: BingoCondition): string {
  if (c.groupName && c.optionName) return `${c.groupName} — ${c.optionName}`;
  return c.shortName?.trim() || c.question;
}

function formatUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

export default function LockedScreen({
  tier,
  conditions,
  picks,
  smartAccountAddress,
  progress,
  isSubmitting,
  error,
  onReset,
}: {
  tier: Tier;
  conditions: BingoCondition[];
  picks: Side[];
  smartAccountAddress?: string;
  progress: Record<string, LineProgress>;
  isSubmitting: boolean;
  error: string | null;
  onReset: () => void;
}) {
  const lines = useMemo(() => buildLines(), []);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

  const lineQuotes = useMemo(
    () =>
      lines.map((line) => ({
        line,
        ...computeLinePayout(line, conditions, picks, tier),
      })),
    [lines, conditions, picks, tier],
  );

  const quoteByLineId = new Map(lineQuotes.map((q) => [q.line.id, q]));
  const totalIfAllHit = lineQuotes.reduce((acc, l) => acc + l.payout, 0);

  // Each payout cell reveals when its line's mint completes successfully.
  const revealed = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) {
      if (progress[l.id]?.status === 'done') set.add(l.id);
    }
    return set;
  }, [lines, progress]);

  const totalRevealed = useMemo(() => {
    if (lines.length === 0) return false;
    return lines.every((l) => {
      const s = progress[l.id]?.status;
      return s === 'done' || s === 'failed';
    });
  }, [lines, progress]);

  const revealedCells = useMemo(() => {
    const out = new Set<number>();
    for (const l of lines) {
      if (revealed.has(l.id)) for (const i of l.cellIndices) out.add(i);
    }
    return out;
  }, [lines, revealed]);

  const highlightedCells = new Set<number>(
    hoveredLineId
      ? (lines.find((l) => l.id === hoveredLineId)?.cellIndices ?? [])
      : [],
  );

  const setHover = (id: string | null) => () => setHoveredLineId(id);

  const successCount = lines.filter(
    (l) => progress[l.id]?.status === 'done',
  ).length;
  const failedCount = lines.filter(
    (l) => progress[l.id]?.status === 'failed',
  ).length;
  const inflightCount = lines.length - successCount - failedCount;

  const statusLabel = (lineId: string): string | null => {
    const s = progress[lineId]?.status;
    if (s === 'pending') return 'WAITING';
    if (s === 'quoting') return 'QUOTING…';
    if (s === 'signing') return 'SIGNING…';
    if (s === 'submitting') return 'SUBMITTING…';
    return null;
  };

  const profileUrl = smartAccountAddress
    ? `https://sapience.xyz/profile/${smartAccountAddress}`
    : null;

  return (
    <section className="screen">
      <div className="card-header">
        <div>
          <div className="muted small">${tier} card · locked</div>
          <h2>Settling your card</h2>
          <p className="muted small">
            {successCount} of {lines.length} confirmed
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            {inflightCount > 0 && isSubmitting
              ? ` · ${inflightCount} in flight`
              : ''}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="locked-grid">
        {conditions.map((c, idx) => {
          const pick = picks[idx];
          const row = Math.floor(idx / 4);
          const col = idx % 4;
          const highlighted = highlightedCells.has(idx);
          const cellRevealed = revealedCells.has(idx);
          return (
            <article
              key={c.id}
              className={`cell locked-cell pick-${pick.toLowerCase()} cell-reveal ${
                cellRevealed ? 'revealed' : ''
              } ${highlighted ? 'cell-highlight' : ''}`}
              style={{ gridColumn: col + 2, gridRow: row + 1 }}
              onMouseEnter={setHover(`row-${row}`)}
              onMouseLeave={setHover(null)}
            >
              <div className="cell-text">{cellLabel(c)}</div>
              <div className="locked-pick">{pick}</div>
            </article>
          );
        })}

        {/* Row payouts */}
        {[0, 1, 2, 3].map((r) => {
          const q = quoteByLineId.get(`row-${r}`);
          if (!q) return null;
          const status = progress[q.line.id]?.status ?? 'pending';
          const isFailed = status === 'failed';
          const isRevealed = revealed.has(q.line.id);
          const label = statusLabel(q.line.id);
          return (
            <div
              key={`row-payout-${r}`}
              className={`payout-cell row-payout reveal ${
                isRevealed ? 'revealed' : ''
              } ${isFailed ? 'payout-failed' : ''} ${label ? 'payout-inflight' : ''}`}
              style={{ gridColumn: 6, gridRow: r + 1 }}
              onMouseEnter={setHover(`row-${r}`)}
              onMouseLeave={setHover(null)}
            >
              {label ? (
                <div className="payout-status">{label}</div>
              ) : (
                <>
                  <div className="payout-amount">{formatUSD(q.payout)}</div>
                  <div className="payout-meta">{q.combinedOdds.toFixed(1)}×</div>
                </>
              )}
            </div>
          );
        })}

        {/* Column payouts */}
        {[0, 1, 2, 3].map((c) => {
          const q = quoteByLineId.get(`col-${c}`);
          if (!q) return null;
          const status = progress[q.line.id]?.status ?? 'pending';
          const isFailed = status === 'failed';
          const isRevealed = revealed.has(q.line.id);
          const label = statusLabel(q.line.id);
          return (
            <div
              key={`col-payout-${c}`}
              className={`payout-cell col-payout reveal ${
                isRevealed ? 'revealed' : ''
              } ${isFailed ? 'payout-failed' : ''} ${label ? 'payout-inflight' : ''}`}
              style={{ gridColumn: c + 2, gridRow: 5 }}
              onMouseEnter={setHover(`col-${c}`)}
              onMouseLeave={setHover(null)}
            >
              {label ? (
                <div className="payout-status">{label}</div>
              ) : (
                <>
                  <div className="payout-amount">{formatUSD(q.payout)}</div>
                  <div className="payout-meta">{q.combinedOdds.toFixed(1)}×</div>
                </>
              )}
            </div>
          );
        })}

        {/* Diagonals */}
        {([
          { id: 'diag-tr-bl', col: 1, arrow: '↙' },
          { id: 'diag-tl-br', col: 6, arrow: '↘' },
        ] as const).map(({ id, col, arrow }) => {
          const q = quoteByLineId.get(id);
          if (!q) return null;
          const status = progress[q.line.id]?.status ?? 'pending';
          const isFailed = status === 'failed';
          const isRevealed = revealed.has(q.line.id);
          const label = statusLabel(q.line.id);
          return (
            <div
              key={id}
              className={`payout-cell diag-payout reveal ${
                isRevealed ? 'revealed' : ''
              } ${isFailed ? 'payout-failed' : ''} ${label ? 'payout-inflight' : ''}`}
              style={{ gridColumn: col, gridRow: 5 }}
              onMouseEnter={setHover(id)}
              onMouseLeave={setHover(null)}
            >
              {label ? (
                <div className="payout-status">{label}</div>
              ) : (
                <>
                  <div className="payout-amount">
                    <span className="diag-arrow">{arrow}</span>{' '}
                    {formatUSD(q.payout)}
                  </div>
                  <div className="payout-meta">{q.combinedOdds.toFixed(1)}×</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="summary-row">
        <span className="muted small">Max payout (all 10 bingos)</span>
        <span className={`mono big reveal ${totalRevealed ? 'revealed' : ''}`}>
          {formatUSD(totalIfAllHit)}
        </span>
      </div>

      {profileUrl && successCount > 0 && (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="primary block"
          style={{ textDecoration: 'none', textAlign: 'center' }}
        >
          View on your Sapience profile ↗
        </a>
      )}

      <button type="button" className="ghost block" onClick={onReset}>
        Mint another card
      </button>
    </section>
  );
}
