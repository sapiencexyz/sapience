import type { Tier } from '../App';

const TIERS: Tier[] = [1, 5, 25];

export default function AmountScreen({ onPick }: { onPick: (t: Tier) => void }) {
  return (
    <section className="screen">
      <h2>Pick an amount</h2>
      <p className="muted">
        Each card costs the same regardless of theme. Bigger mint = bigger
        potential payout.
      </p>
      <div className="tier-grid">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            className="tier-button"
            onClick={() => onPick(t)}
          >
            <span className="tier-price">${t}</span>
            <span className="tier-label">per card</span>
          </button>
        ))}
      </div>
    </section>
  );
}
