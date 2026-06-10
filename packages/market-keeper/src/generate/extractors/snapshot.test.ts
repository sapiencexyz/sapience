import { describe, it, expect } from 'vitest';

import { snapshotEndTime } from './snapshot';

/**
 * "Ranking snapshot" markets resolve by reading a leaderboard / list at an
 * explicit, stated timestamp. snapshotEndTime returns that timestamp (unix
 * seconds, DST-aware ET). Each family is anchored on its own resolution phrase
 * — deliberately NOT a generic "snapshot verb + nearby date", which the
 * false-positive analysis showed grabs the wrong timestamp on Netflix (which
 * carries two) and leaks onto non-ranking markets.
 */
describe('snapshotEndTime', () => {
  it('AI leaderboard: "...is checked on <date>, <time> ET"', () => {
    const desc =
      'This market will resolve according to the company that owns the model that has the highest rank based on the Agent Arena Leaderboard (https://arena.ai/leaderboard/agent) when the table under "Agent Arena" filtered for "Models" is checked on June 30, 2026, 12:00 PM ET. Results from the "Rank" column will be used.';
    // June 30, 2026 12:00 PM EDT = 2026-06-30T16:00:00Z
    expect(
      snapshotEndTime(
        'Will OpenAI have the best AI Agent at the end of June 2026?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 30, 16, 0, 0) / 1000);
  });

  it('AI leaderboard: winter date resolves at EST (UTC-5)', () => {
    const desc =
      'This market will resolve according to the company ... is checked on January 31, 2026, 12:00 PM ET. Results from the "Rank" column will be used.';
    // Jan 31, 2026 12:00 PM EST = 2026-01-31T17:00:00Z
    expect(
      snapshotEndTime(
        'Will X have the best AI model at the end of January 2026?',
        desc
      )
    ).toBe(Date.UTC(2026, 0, 31, 17, 0, 0) / 1000);
  });

  it('Netflix: picks the "...ET, reflecting" publish time, NOT the fallback timestamp', () => {
    const desc =
      'Netflix is expected to update its Top 10 TV shows list on top10.netflix.com on Tuesday, June 9, 2026, 3:00 PM ET, reflecting viewership from the previous week (Monday to Sunday). This market will resolve based on which show this update ranks as the #2 US Netflix show. If Netflix does not update the list by June 12, 2026, 11:59 PM ET, this market will resolve to "No".';
    // June 9, 2026 3:00 PM EDT = 2026-06-09T19:00:00Z  (NOT June 12)
    expect(
      snapshotEndTime(
        'Will "Nemesis" be the #2 US Netflix show this week?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 9, 19, 0, 0) / 1000);
  });

  it('declines (null) on a postponement-fallback timestamp (no snapshot cue)', () => {
    const desc =
      'This market resolves YES if the concert takes place. If the event is canceled or postponed beyond June 12, 2026, 11:59 PM ET, this market will resolve to "No".';
    expect(
      snapshotEndTime('Will Dua Lipa perform at Coachella?', desc)
    ).toBeNull();
  });

  it('declines (null) on unrelated markets', () => {
    expect(
      snapshotEndTime(
        'Will Bitcoin reach $150,000 in 2026?',
        'Resolves YES if BTC trades above $150,000.'
      )
    ).toBeNull();
  });
});
