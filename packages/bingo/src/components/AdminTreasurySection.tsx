import { Fragment, useState } from 'react';
import { fmtUnits, shortAddress } from '../lib/format/balance';
import type {
  RiskFlag,
  TreasuryResponse,
  TreasuryWinnerCard,
} from '../lib/backendApi';

function wei(v: string | null | undefined): bigint | undefined {
  if (v == null) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

/** 25000 bps → "2.5×". */
function fmtMult(bps: number): string {
  return `${(bps / 10_000).toFixed(2).replace(/\.00$/, '')}×`;
}

function fmtPct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(0)}%`;
}

// Short label + hover explanation per signal. Kept here (not the server) since
// it's purely presentational.
const FLAG_META: Record<RiskFlag, { label: string; title: string }> = {
  reroll: {
    label: 'Re-roll',
    title:
      'Funded a card sitting above abandoned (0-line) indexes — cherry-picked a favorable layout.',
  },
  'self-referral': {
    label: 'Self-ref',
    title: 'Referred their own card (ref == player).',
  },
  'referral-ring': {
    label: 'Ring',
    title: 'Reciprocal referral with another player (A→B and B→A).',
  },
  'win-rate-outlier': {
    label: 'Win-rate',
    title: 'Win rate far above the population base rate over enough cards.',
  },
  concentration: {
    label: 'Concentration',
    title: 'Holds an outsized share of total bonus owed.',
  },
};

function RiskBadges({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) return <span className="muted">—</span>;
  return (
    <span className="risk-badges">
      {flags.map((f) => (
        <span key={f} className="risk-badge" title={FLAG_META[f].title}>
          {FLAG_META[f].label}
        </span>
      ))}
    </span>
  );
}

function WinnersTable({ cards }: { cards: TreasuryWinnerCard[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Card</th>
            <th className="num">Wins</th>
            <th className="num">Multiplier</th>
            <th className="num">Stake</th>
            <th className="num">Bonus owed</th>
            <th>Decided</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={`${c.poolId}:${c.cardIndex}`}>
              <td className="mono">#{c.cardIndex + 1}</td>
              <td className="mono num">{c.wins}</td>
              <td className="mono num">{fmtMult(c.multiplierBps)}</td>
              <td className="mono num">{fmtUnits(wei(c.cardPriceWei))}</td>
              <td className="mono num">
                {fmtUnits(wei(c.bonusOwedWei))}
                {c.bonusPaidOnChain ? ' ✓' : ''}
              </td>
              <td className="mono">
                {c.decided == null ? '—' : c.decided ? 'yes' : 'open'}
              </td>
              <td>
                <RiskBadges flags={c.flags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTreasurySection({
  treasury,
  loading,
  loadError,
}: {
  treasury: TreasuryResponse | null;
  loading: boolean;
  loadError: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="screen admin-section">
      <h2>Treasury — winners & risk</h2>
      <p className="muted small">
        Per-player payout exposure and gaming signals, folded from chain state.
        Click a player to see their winning cards and multipliers. Read-only —
        pay from the entitlements table below.
      </p>
      {loadError && <p className="error small">{loadError}</p>}
      {!treasury && !loadError && (
        <p className="muted small">
          {loading ? 'Loading…' : 'Sign in and Load to see the treasury view.'}
        </p>
      )}

      {treasury && (
        <>
          <div className="admin-kv">
            <div>Total bonus owed</div>
            <div className="mono">
              {fmtUnits(wei(treasury.totalBonusOwedWei))}
            </div>
            <div>Total bonus paid</div>
            <div className="mono">
              {fmtUnits(wei(treasury.totalBonusPaidWei))}
            </div>
            <div>Base win rate</div>
            <div className="mono">{fmtPct(treasury.baseWinRate)}</div>
            <div>Flagged players</div>
            <div className="mono">
              {treasury.players.filter((p) => p.riskFlags.length > 0).length} /{' '}
              {treasury.players.length}
            </div>
          </div>

          {treasury.players.length === 0 ? (
            <p className="muted small">No cards submitted yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="num">Cards</th>
                    <th className="num">Win rate</th>
                    <th className="num">Max mult</th>
                    <th className="num">Bonus owed</th>
                    <th className="num">Share</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {treasury.players.map((p) => {
                    const key = p.player.toLowerCase();
                    const isOpen = expanded === key;
                    const cards = treasury.winners.filter(
                      (w) => w.player.toLowerCase() === key,
                    );
                    return (
                      <Fragment key={key}>
                        <tr
                          className={`admin-row-clickable${
                            p.riskFlags.length > 0 ? ' admin-table-flagged' : ''
                          }`}
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          <td className="mono">
                            {cards.length > 0 ? (isOpen ? '▾ ' : '▸ ') : ''}
                            {shortAddress(p.player)}
                          </td>
                          <td className="mono num">
                            {p.funded}
                            {p.abandoned > 0 ? (
                              <span
                                className="muted"
                                title={`${p.abandoned} abandoned (${p.abandonedBelowFunded} below a funded card)`}
                              >
                                {' '}
                                +{p.abandoned}✗
                              </span>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="mono num">{fmtPct(p.winRate)}</td>
                          <td className="mono num">
                            {p.maxMultiplierBps > 0
                              ? fmtMult(p.maxMultiplierBps)
                              : '—'}
                          </td>
                          <td className="mono num">
                            {fmtUnits(wei(p.totalBonusOwedWei))}
                          </td>
                          <td className="mono num">
                            {(p.bonusShareBps / 100).toFixed(0)}%
                          </td>
                          <td>
                            <RiskBadges flags={p.riskFlags} />
                          </td>
                        </tr>
                        {isOpen && cards.length > 0 && (
                          <tr>
                            <td colSpan={7} className="admin-nested-cell">
                              <WinnersTable cards={cards} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
