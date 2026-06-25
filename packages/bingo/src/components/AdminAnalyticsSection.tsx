import { fmtUnits, shortAddress } from '../lib/format/balance';
import type { AnalyticsResponse } from '../lib/backendApi';

function wei(v: string | null | undefined): bigint | undefined {
  if (v == null) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

/** Read-only dashboard: a fold over the SAME on-chain data the entitlements +
 *  sponsorships panels show. Loads alongside them (one admin "Load"). */
export default function AdminAnalyticsSection({
  analytics,
  loading,
  loadError,
}: {
  analytics: AnalyticsResponse | null;
  loading: boolean;
  loadError: string | null;
}) {
  const maxWins =
    analytics && analytics.wins.histogram.length > 0
      ? Math.max(...analytics.wins.histogram)
      : 0;

  return (
    <section className="screen admin-section">
      <h2>Analytics</h2>
      <p className="muted small">
        Aggregate of every submitted card + sponsorship grant, computed from
        chain state. Loads with the entitlements panel above.
      </p>
      {loadError && <p className="error small">{loadError}</p>}
      {!analytics && !loadError && (
        <p className="muted small">
          {loading ? 'Loading…' : 'Sign in and Load to see analytics.'}
        </p>
      )}

      {analytics && (
        <>
          <h3 className="admin-subhead">Cards</h3>
          <div className="admin-kv">
            <div>Total cards</div>
            <div className="mono">{analytics.cards.total}</div>
            <div>Complete (10/10 funded)</div>
            <div className="mono">{analytics.cards.complete}</div>
            <div>Distinct players</div>
            <div className="mono">{analytics.cards.distinctPlayers}</div>
            <div>Sponsored / self-funded</div>
            <div className="mono">
              {analytics.cards.sponsored} / {analytics.cards.selfFunded}
            </div>
            <div>Total staked</div>
            <div className="mono">{fmtUnits(wei(analytics.staked.totalWei))}</div>
            <div>…sponsored / self-funded</div>
            <div className="mono">
              {fmtUnits(wei(analytics.staked.sponsoredWei))} /{' '}
              {fmtUnits(wei(analytics.staked.selfFundedWei))}
            </div>
          </div>

          <h3 className="admin-subhead">
            Wins ({analytics.wins.decidedCards} decided cards)
          </h3>
          {analytics.wins.decidedCards === 0 ? (
            <p className="muted small">No fully-decided cards yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="num">Wins</th>
                    <th className="num">Cards</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.wins.histogram.map((count, w) =>
                    count === 0 ? null : (
                      <tr key={w}>
                        <td className="mono num">{w}</td>
                        <td className="mono num">{count}</td>
                        <td>
                          <span
                            className="admin-bar"
                            style={{
                              width: `${maxWins > 0 ? (count / maxWins) * 100 : 0}%`,
                            }}
                            aria-hidden
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-subhead">Treasury — bonuses</h3>
          <div className="admin-kv">
            <div>Payable now</div>
            <div className="mono">
              {fmtUnits(wei(analytics.bonuses.payableWei))} (
              {analytics.bonuses.payableCount})
            </div>
            <div>Provisional (still growing)</div>
            <div className="mono">
              {fmtUnits(wei(analytics.bonuses.provisionalWei))}
            </div>
            <div>Paid on-chain</div>
            <div className="mono">
              {fmtUnits(wei(analytics.bonuses.paidWei))} (
              {analytics.bonuses.paidCount})
            </div>
          </div>

          <h3 className="admin-subhead">Treasury — referrals</h3>
          <div className="admin-kv">
            <div>Payable now</div>
            <div className="mono">
              {fmtUnits(wei(analytics.referrals.payableWei))} (
              {analytics.referrals.payableCount})
            </div>
            <div>Paid on-chain</div>
            <div className="mono">
              {fmtUnits(wei(analytics.referrals.paidWei))} (
              {analytics.referrals.paidCount})
            </div>
            <div>Distinct referrers</div>
            <div className="mono">{analytics.referrals.distinctReferrers}</div>
          </div>

          <h3 className="admin-subhead">Sponsorship</h3>
          <div className="admin-kv">
            <div>Sponsor contract</div>
            <div className="mono small">
              {analytics.sponsorship.sponsorAddress
                ? shortAddress(analytics.sponsorship.sponsorAddress)
                : '—'}
            </div>
            <div>Beneficiaries (played)</div>
            <div className="mono">
              {analytics.sponsorship.beneficiaries} ({analytics.sponsorship.played})
            </div>
            <div>Allocated</div>
            <div className="mono">
              {fmtUnits(wei(analytics.sponsorship.allocatedWei))}
            </div>
            <div>Used / remaining</div>
            <div className="mono">
              {fmtUnits(wei(analytics.sponsorship.usedWei))} /{' '}
              {fmtUnits(wei(analytics.sponsorship.remainingWei))}
            </div>
            <div>Bankroll</div>
            <div className="mono">
              {fmtUnits(wei(analytics.sponsorship.bankrollWei))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
