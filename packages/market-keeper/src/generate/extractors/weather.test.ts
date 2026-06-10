import { describe, expect, it } from 'vitest';

import { weatherEndTime } from './weather';

describe('weatherEndTime', () => {
  it('uses EST, not summer EDT, for New York winter weather markets', () => {
    const ts = weatherEndTime(
      'Will the high temperature in New York City be 32°F or higher on January 15?',
      "This market will resolve based on the temperature in New York City on Jan 15, '26."
    );

    expect(ts).toBe(Date.UTC(2026, 0, 16, 4, 59) / 1000);
  });

  it('uses GMT, not summer BST, for London winter weather markets', () => {
    const ts = weatherEndTime(
      'Will the high temperature in London be 10°C or higher on December 20?',
      "This market will resolve based on the temperature in London on Dec 20, '26."
    );

    expect(ts).toBe(Date.UTC(2026, 11, 20, 23, 59) / 1000);
  });
});
