import { useMemo, useState } from 'react';
import type { Tier } from '../App';
import type { BingoCondition } from '../api';

export type Side = 'YES' | 'NO';

interface Props {
  tier: Tier;
  conditions: BingoCondition[];
  onSubmit: (picks: Side[]) => void;
}

function cellLabel(c: BingoCondition): string {
  if (c.groupName && c.optionName) return `${c.groupName} — ${c.optionName}`;
  return c.shortName?.trim() || c.question;
}

export default function CardScreen({
  tier,
  conditions,
  onSubmit,
}: Props) {
  const [picks, setPicks] = useState<(Side | null)[]>(() =>
    Array(conditions.length).fill(null),
  );

  const allFilled = useMemo(() => picks.every((p) => p !== null), [picks]);
  const filledCount = picks.filter((p) => p !== null).length;

  const setPick = (idx: number, side: Side) => {
    setPicks((prev) => {
      const next = prev.slice();
      next[idx] = next[idx] === side ? null : side;
      return next;
    });
  };

  const quickPick = () => {
    setPicks(
      Array.from(
        { length: conditions.length },
        () => (Math.random() < 0.5 ? 'YES' : 'NO') as Side,
      ),
    );
  };

  return (
    <section className="screen">
      <div className="card-header">
        <div>
          <div className="muted small">${tier} card</div>
          <h2>Make your picks</h2>
          <p className="muted small">
            {filledCount} / {conditions.length} selected
          </p>
        </div>
      </div>

      <div className="grid">
        {conditions.map((c, idx) => {
          const pick = picks[idx];
          return (
            <article
              key={c.id}
              className={`cell ${pick ? 'cell-picked' : ''} ${c.similarMarketImage ? 'cell-has-bg' : ''}`}
              style={
                c.similarMarketImage
                  ? {
                      backgroundImage: `linear-gradient(180deg, rgba(8,12,24,0.55) 0%, rgba(8,12,24,0.92) 100%), url(${c.similarMarketImage})`,
                    }
                  : undefined
              }
            >
              <div className="cell-text">{cellLabel(c)}</div>
              <div className="pick-toggle">
                <button
                  type="button"
                  className={`pick yes ${pick === 'YES' ? 'on' : ''}`}
                  onClick={() => setPick(idx, 'YES')}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={`pick no ${pick === 'NO' ? 'on' : ''}`}
                  onClick={() => setPick(idx, 'NO')}
                >
                  NO
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="submit-bar">
        <button
          type="button"
          className="quick-pick block"
          onClick={quickPick}
        >
          Quick pick
        </button>
        <button
          type="button"
          className="primary block"
          disabled={!allFilled}
          onClick={() => onSubmit(picks as Side[])}
        >
          {allFilled
            ? 'Submit card'
            : `Pick ${conditions.length - filledCount} more`}
        </button>
      </div>
    </section>
  );
}
