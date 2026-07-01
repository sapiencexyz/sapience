import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

function makeForecast(overrides: Record<string, unknown> = {}) {
  return {
    uid: '0xabc123',
    attester: '0x1234567890abcdef1234567890abcdef12345678',
    attestedAt: 1700000000,
    value: '750000000000000000',
    comment: 'I think yes',
    conditionId: '0xcond1',
    condition: {
      id: '0xcond1', // aliased from conditionId in the GraphQL document
      question: 'Will it happen?',
      shortName: 'It happens',
      endTime: 1800000000,
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      resolver: '0xresolver',
      category: { slug: 'tech-science' },
    },
    ...overrides,
  };
}

function okResponse(forecast: unknown) {
  return {
    ok: true,
    json: async () => ({ data: { forecast } }),
  };
}

describe('FORECAST_BY_UID_QUERY (GraphQL document)', () => {
  test('targets the forecast(uid:) lookup, not the old attestations query', async () => {
    const { FORECAST_BY_UID_QUERY } = await import('./forecasts');
    expect(FORECAST_BY_UID_QUERY).toContain('forecast(uid: $uid)');
    expect(FORECAST_BY_UID_QUERY).not.toContain('attestations(');
    expect(FORECAST_BY_UID_QUERY).not.toContain('AttestationWhereInput');
    expect(FORECAST_BY_UID_QUERY).not.toContain('prediction');
  });

  test('selects the GraphQL field names and re-keys condition id to the hash', async () => {
    const { FORECAST_BY_UID_QUERY } = await import('./forecasts');
    expect(FORECAST_BY_UID_QUERY).toContain('attestedAt');
    expect(FORECAST_BY_UID_QUERY).toContain('value');
    expect(FORECAST_BY_UID_QUERY).toContain('id: conditionId');
    expect(FORECAST_BY_UID_QUERY).toContain('nonDecisive');
  });
});

describe('fetchAttestationByUid', () => {
  test('POSTs to the GraphQL endpoint with the uid variable', async () => {
    mockFetch.mockResolvedValue(okResponse(makeForecast()));
    const { fetchAttestationByUid } = await import('./forecasts');

    await fetchAttestationByUid('0xabc123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    // The endpoint follows the app's default network (Robinhood → Meridian),
    // not NEXT_PUBLIC_FOIL_API_URL (set above but intentionally ignored).
    expect(url).toBe('https://api.predict.meridian.xyz/graphql');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.variables).toEqual({ uid: '0xabc123' });
  });

  test('maps the GraphQL node onto the stable AttestationData shape', async () => {
    mockFetch.mockResolvedValue(okResponse(makeForecast()));
    const { fetchAttestationByUid } = await import('./forecasts');

    const result = await fetchAttestationByUid('0xabc123');

    expect(result).not.toBeNull();
    // GraphQL renames undone for consumers: attestedAt -> time, value -> prediction
    expect(result?.time).toBe(1700000000);
    expect(result?.prediction).toBe('750000000000000000');
    expect(result?.uid).toBe('0xabc123');
    expect(result?.attester).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result?.comment).toBe('I think yes');
    expect(result?.conditionId).toBe('0xcond1');
    // condition.id carries the conditionId hash (numeric row ids are gone)
    expect(result?.condition?.id).toBe('0xcond1');
    expect(result?.condition?.question).toBe('Will it happen?');
    expect(result?.condition?.endTime).toBe(1800000000);
    expect(result?.condition?.resolver).toBe('0xresolver');
    // no numeric attestation row id on the GraphQL shape
    expect(result).not.toHaveProperty('id');
  });

  test('returns null when the forecast does not exist', async () => {
    mockFetch.mockResolvedValue(okResponse(null));
    const { fetchAttestationByUid } = await import('./forecasts');
    expect(await fetchAttestationByUid('0xmissing')).toBeNull();
  });

  test('returns null on a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { fetchAttestationByUid } = await import('./forecasts');
    expect(await fetchAttestationByUid('0xabc123')).toBeNull();
  });

  test('preserves a null condition relation', async () => {
    mockFetch.mockResolvedValue(
      okResponse(makeForecast({ condition: null, conditionId: null }))
    );
    const { fetchAttestationByUid } = await import('./forecasts');
    const result = await fetchAttestationByUid('0xabc123');
    expect(result?.condition).toBeNull();
    expect(result?.conditionId).toBeNull();
  });
});

describe('d18ToPercentage', () => {
  test('converts a D18 probability string to 0-100', async () => {
    const { d18ToPercentage } = await import('./forecasts');
    expect(d18ToPercentage('750000000000000000')).toBeCloseTo(0.75);
    expect(d18ToPercentage('75000000000000000000')).toBeCloseTo(75);
  });
});
