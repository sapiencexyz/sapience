import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEventTags, normalizeTagLabel } from '../generate/tags';

const mockFetchWithRetry = vi.fn();
vi.mock('../utils', () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchEventTags', () => {
  const opts = {
    endDateMin: '2025-01-01T00:00:00Z',
    endDateMax: '2025-02-01T00:00:00Z',
  };

  function mockResponse(events: unknown[]) {
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(events),
    });
  }

  it('fetches events and returns tag labels mapped by event slug', async () => {
    mockResponse([
      {
        slug: 'us-election',
        tags: [
          { label: 'Politics', slug: 'politics' },
          { label: 'Elections', slug: 'elections' },
        ],
      },
      {
        slug: 'bitcoin-price',
        tags: [{ label: 'Crypto', slug: 'crypto' }],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.get('us-election')).toEqual(['Politics', 'Elections']);
    expect(result.get('bitcoin-price')).toEqual(['Crypto']);
  });

  it('filters out the generic "All" tag', async () => {
    mockResponse([
      {
        slug: 'ufc-fight',
        tags: [
          { label: 'All', slug: 'all' },
          { label: 'UFC', slug: 'ufc' },
        ],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.get('ufc-fight')).toEqual(['UFC']);
  });

  it('returns empty map when API returns no events', async () => {
    mockResponse([]);

    const result = await fetchEventTags(opts);

    expect(result.size).toBe(0);
  });

  it('handles events with no tags field', async () => {
    mockResponse([{ slug: 'no-tags-event' }]);

    const result = await fetchEventTags(opts);

    expect(result.get('no-tags-event')).toEqual([]);
  });

  it('deduplicates tag labels', async () => {
    mockResponse([
      {
        slug: 'dup-event',
        tags: [
          { label: 'Crypto', slug: 'crypto' },
          { label: 'Crypto', slug: 'crypto-2' },
        ],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.get('dup-event')).toEqual(['Crypto']);
  });

  it('deduplicates after normalization (temperature + Temperature collapse)', async () => {
    mockResponse([
      {
        slug: 'case-dup',
        tags: [
          { label: 'temperature', slug: 'temperature' },
          { label: 'Temperature', slug: 'temperature-2' },
        ],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.get('case-dup')).toEqual(['Temperature']);
  });

  it('title-cases each word and preserves acronyms', async () => {
    // Polymarket returns some labels miscased. Per-word Title Case capitalizes
    // every word, but the acronym guard leaves words with any uppercase letter
    // untouched, so "UFC" survives.
    mockResponse([
      {
        slug: 'weather-event',
        tags: [
          { label: 'temperature', slug: 'temperature' },
          { label: 'Highest temperature', slug: 'highest-temperature' },
          { label: 'UFC', slug: 'ufc' },
          { label: 'Weather', slug: 'weather' },
        ],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.get('weather-event')).toEqual([
      'Temperature',
      'Highest Temperature',
      'UFC',
      'Weather',
    ]);
  });

  it('returns empty map on API error', async () => {
    mockFetchWithRetry.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchEventTags(opts);

    expect(result.size).toBe(0);
  });

  it('skips events without a slug', async () => {
    mockResponse([
      {
        tags: [{ label: 'Orphan', slug: 'orphan' }],
      },
    ]);

    const result = await fetchEventTags(opts);

    expect(result.size).toBe(0);
  });

  it('paginates when a page returns exactly PAGE_SIZE (500) events', async () => {
    // First page: 500 events (triggers next page fetch)
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      slug: `event-${i}`,
      tags: [{ label: 'Tag', slug: 'tag' }],
    }));
    // Second page: fewer than 500 (signals end)
    const page2 = [
      {
        slug: 'event-500',
        tags: [{ label: 'Final', slug: 'final' }],
      },
    ];

    mockFetchWithRetry
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) });

    const result = await fetchEventTags(opts);

    expect(result.size).toBe(501);
    expect(result.get('event-0')).toEqual(['Tag']);
    expect(result.get('event-500')).toEqual(['Final']);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    // Verify offset parameter
    expect(mockFetchWithRetry.mock.calls[0][0]).toContain('offset=0');
    expect(mockFetchWithRetry.mock.calls[1][0]).toContain('offset=500');
  });

  it('stops paginating on API error mid-pagination', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      slug: `event-${i}`,
      tags: [{ label: 'Tag', slug: 'tag' }],
    }));

    mockFetchWithRetry
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

    const result = await fetchEventTags(opts);

    // Should still return what was fetched from page 1
    expect(result.size).toBe(500);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });
});

describe('normalizeTagLabel', () => {
  it('capitalizes a single lowercase word', () => {
    expect(normalizeTagLabel('temperature')).toBe('Temperature');
  });

  it('capitalizes every word of a multi-word lowercase label', () => {
    expect(normalizeTagLabel('primary elections')).toBe('Primary Elections');
    expect(normalizeTagLabel('highest temperature')).toBe(
      'Highest Temperature'
    );
  });

  it('leaves already Title-Cased labels unchanged', () => {
    expect(normalizeTagLabel('Sports')).toBe('Sports');
    expect(normalizeTagLabel('Senate Primary')).toBe('Senate Primary');
  });

  it('preserves acronyms via the uppercase-letter guard', () => {
    expect(normalizeTagLabel('UFC')).toBe('UFC');
    expect(normalizeTagLabel('NFL')).toBe('NFL');
    expect(normalizeTagLabel('F1')).toBe('F1');
  });

  it('preserves mixed-case brand words', () => {
    expect(normalizeTagLabel('DeFi')).toBe('DeFi');
    expect(normalizeTagLabel('iOS launch')).toBe('iOS Launch');
  });

  it('treats hyphenated tokens as one word (no split on hyphen)', () => {
    expect(normalizeTagLabel('updated-tag')).toBe('Updated-tag');
  });

  it('returns the input unchanged for empty string', () => {
    expect(normalizeTagLabel('')).toBe('');
  });

  it('handles mixed inputs (acronym + lowercase multi-word)', () => {
    expect(normalizeTagLabel('UFC fight night')).toBe('UFC Fight Night');
  });

  describe('small-word skip list', () => {
    it('keeps "or" lowercase between two content words', () => {
      expect(normalizeTagLabel('Up or Down')).toBe('Up or Down');
      // and lowercases an incorrectly-capitalized "Or"
      expect(normalizeTagLabel('Up Or Down')).toBe('Up or Down');
    });

    it('keeps "of" lowercase in multi-word names', () => {
      expect(normalizeTagLabel('Democratic Party of Korea')).toBe(
        'Democratic Party of Korea'
      );
      expect(normalizeTagLabel('Strait of Hormuz')).toBe('Strait of Hormuz');
      expect(normalizeTagLabel('league of legends')).toBe('League of Legends');
    });

    it('keeps "x" lowercase (matchup separator)', () => {
      expect(normalizeTagLabel('U.S. x Iran')).toBe('U.S. x Iran');
      expect(normalizeTagLabel('Brazil x Argentina')).toBe(
        'Brazil x Argentina'
      );
    });

    it('keeps "the", "and", "vs" lowercase mid-tag', () => {
      expect(normalizeTagLabel('The lord of the rings')).toBe(
        'The Lord of the Rings'
      );
      expect(normalizeTagLabel('rock and roll')).toBe('Rock and Roll');
      expect(normalizeTagLabel('Trump vs Biden')).toBe('Trump vs Biden');
    });

    it('capitalizes a small word when it is the first word', () => {
      expect(normalizeTagLabel('of mice and men')).toBe('Of Mice and Men');
      expect(normalizeTagLabel('the rolling stones')).toBe(
        'The Rolling Stones'
      );
    });

    it('preserves all-caps short words as acronyms (not lowercased)', () => {
      // "OR" the Oregon state code, not the conjunction
      expect(normalizeTagLabel('Salem OR Race')).toBe('Salem OR Race');
      expect(normalizeTagLabel('Austin TX Heat')).toBe('Austin TX Heat');
    });

    it('always capitalizes the last word even if it is a small word', () => {
      // Per AP/Chicago, last word always capitalizes.
      expect(normalizeTagLabel('things to come to')).toBe('Things to Come To');
      expect(normalizeTagLabel('what are you waiting for')).toBe(
        'What Are You Waiting For'
      );
    });

    it('lowercases the additional short prepositions (up, off, per, via)', () => {
      expect(normalizeTagLabel('What is up with that')).toBe(
        'What Is up With That'
      );
      expect(normalizeTagLabel('Days off work')).toBe('Days off Work');
      expect(normalizeTagLabel('Prize per round')).toBe('Prize per Round');
      expect(normalizeTagLabel('Sent via courier')).toBe('Sent via Courier');
    });

    it('handles a single small word as-is (first === last → capitalize)', () => {
      expect(normalizeTagLabel('of')).toBe('Of');
      expect(normalizeTagLabel('the')).toBe('The');
    });
  });
});
