import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEventTags } from '../generate/tags';

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

  it('capitalizes the first letter of each label (preserves rest)', async () => {
    // Polymarket returns some labels miscased, e.g. `temperature` lowercase.
    // We normalize the first character so acronyms like "UFC" are untouched
    // but "temperature" becomes "Temperature".
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
      'Highest temperature',
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
