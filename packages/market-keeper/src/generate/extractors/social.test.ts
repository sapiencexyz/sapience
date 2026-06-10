import { describe, it, expect } from 'vitest';

import { socialEndTime } from './social';

/**
 * The mention ("What will X say") and social-post-count ("# tweets / # posts /
 * # Truth Social posts") families both carry their resolution window verbatim
 * in the description. socialEndTime reads the UPPER bound of that window and
 * returns it as a unix timestamp (seconds). Expected values below are the
 * second date of each window, in ET (DST-aware: EDT = UTC-4 for these dates).
 */
describe('socialEndTime', () => {
  it('mention weekly: "mentions the listed term between D1 and D2" -> D2 (11:59 PM ET)', () => {
    const desc =
      'This market will resolve to “Yes” if Donald Trump mentions the listed term between May 25, 2026, 12:00 AM ET and May 31, 2026, 11:59 PM ET. Otherwise, this market will resolve to “No”.';
    // May 31, 2026 11:59 PM EDT = 2026-06-01T03:59:00Z
    expect(socialEndTime('Will Trump say "Coward" this week?', desc)).toBe(
      Date.UTC(2026, 5, 1, 3, 59, 0) / 1000
    );
  });

  it('mention monthly: full-month window -> last-day 11:59 PM ET', () => {
    const desc =
      'This market will resolve to “Yes” if Donald Trump mentions the listed term between June 1, 2026, 12:00 AM ET and June 30, 2026, 11:59 PM ET. Otherwise, this market will resolve to “No”.';
    // June 30, 2026 11:59 PM EDT = 2026-07-01T03:59:00Z
    expect(socialEndTime('Will Trump say "Sex" in June?', desc)).toBe(
      Date.UTC(2026, 6, 1, 3, 59, 0) / 1000
    );
  });

  it('social (Elon) "posts on X from D1 to D2" -> D2 (12:00 PM ET)', () => {
    const desc =
      'This market will resolve according to the number of times Elon Musk (@elonmusk), posts on X from May 26 12:00 PM ET to June 2, 2026 12:00 PM ET.';
    // June 2, 2026 12:00 PM EDT = 2026-06-02T16:00:00Z
    expect(
      socialEndTime(
        'Will Elon Musk post 120-139 tweets from May 26 to June 2, 2026?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 2, 16, 0, 0) / 1000);
  });

  it('social (X) "posts on X between D1 and D2" -> D2', () => {
    const desc =
      'This market will resolve according to the number of times Khamenei (@khamenei_ir), posts on X between June 12, 12:00 PM ET and June 19, 2026, 12:00 PM ET.';
    // June 19, 2026 12:00 PM EDT = 2026-06-19T16:00:00Z
    expect(
      socialEndTime(
        'Will Khamenei post 0-4 posts from June 12 to June 19, 2026?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 19, 16, 0, 0) / 1000);
  });

  it('mention variant: "posts/truths the listed term between D1 and D2" (Truth Social)', () => {
    const desc =
      'This market will resolve to "Yes" if @realDonaldTrump posts/truths the listed term between June 9, 2026, 12:00 AM ET and June 14, 2026, 11:59 PM ET. Otherwise, this market will resolve to "No".';
    // June 14, 2026 11:59 PM EDT = 2026-06-15T03:59:00Z
    expect(
      socialEndTime(
        'Will Trump post "Dumocrat" on Truth Social this week?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 15, 3, 59, 0) / 1000);
  });

  it('social (Truth Social) "posts on Truth Social between D1 and D2" -> D2', () => {
    const desc =
      'This market will resolve according to the number of times Donald Trump (@realDonaldTrump), posts on Truth Social between June 2, 12:00 PM ET and June 9, 2026, 12:00 PM ET.';
    expect(
      socialEndTime(
        'Will Donald Trump post 0-19 Truth Social posts from June 2 to June 9, 2026?',
        desc
      )
    ).toBe(Date.UTC(2026, 5, 9, 16, 0, 0) / 1000);
  });

  it('DST-aware: a winter window resolves at EST (UTC-5), not EDT', () => {
    const desc =
      'This market will resolve to “Yes” if Donald Trump mentions the listed term between January 1, 2026, 12:00 AM ET and January 31, 2026, 11:59 PM ET. Otherwise, this market will resolve to “No”.';
    // Jan 31, 2026 11:59 PM EST = 2026-02-01T04:59:00Z
    expect(socialEndTime('Will Trump say "Snow" in January?', desc)).toBe(
      Date.UTC(2026, 1, 1, 4, 59, 0) / 1000
    );
  });

  it('declines (null) when no resolution window is present (podcast pattern)', () => {
    const desc =
      'This market will resolve to "Yes" if the listed term is mentioned by anyone during the next released episode of the Lemonade Stand Podcast. Otherwise, the market will resolve to "No".';
    expect(
      socialEndTime('Will "Oil" be said during the next episode?', desc)
    ).toBeNull();
  });

  it('declines (null) for unrelated markets', () => {
    expect(
      socialEndTime(
        'Will Bitcoin reach $150,000 in 2026?',
        'This market resolves YES if BTC trades above $150,000 on any major exchange.'
      )
    ).toBeNull();
  });
});
