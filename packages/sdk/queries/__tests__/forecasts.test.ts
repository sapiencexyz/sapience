import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  GET_FORECASTS_QUERY,
  GET_FORECASTS_PAGINATED_QUERY,
  formatAttestationData,
  generateForecastsQueryKey,
  fetchForecasts,
  fetchForecastsPage,
  fetchUserForecasts,
} from '../forecasts';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const DEFAULT_SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    uid: '0xabc123',
    attester: '0x1234567890abcdef1234567890abcdef12345678',
    attestedAt: 1700000000,
    value: '75',
    comment: 'I think yes',
    conditionId: '0xcond1',
    ...overrides,
  };
}

// ============================================================================
// forecast documents
// ============================================================================

describe('forecast documents', () => {
  test('list query targets the forecasts connection with explicit ATTESTED_AT DESC', () => {
    expect(GET_FORECASTS_QUERY).toContain('forecasts(');
    expect(GET_FORECASTS_QUERY).toContain(
      'orderBy: { field: ATTESTED_AT, direction: DESC }'
    );
    expect(GET_FORECASTS_QUERY).toContain('first: $first');
    expect(GET_FORECASTS_QUERY).toContain('after: $after');
    expect(GET_FORECASTS_QUERY).toContain('filter: $filter');
    expect(GET_FORECASTS_QUERY).toContain('hasNextPage');
    expect(GET_FORECASTS_QUERY).toContain('endCursor');
    expect(GET_FORECASTS_QUERY).toContain('nodes');
    // current field names — not the legacy attestation row shape
    expect(GET_FORECASTS_QUERY).toContain('attestedAt');
    expect(GET_FORECASTS_QUERY).toContain('value');
    expect(GET_FORECASTS_QUERY).not.toContain('prediction');
    expect(GET_FORECASTS_QUERY).not.toMatch(/\bid\b/);
    expect(GET_FORECASTS_QUERY).not.toMatch(/\btime\b/);
  });

  test('paginated query threads first/after and selects pageInfo', () => {
    expect(GET_FORECASTS_PAGINATED_QUERY).toContain('first: $first');
    expect(GET_FORECASTS_PAGINATED_QUERY).toContain('after: $after');
    expect(GET_FORECASTS_PAGINATED_QUERY).toContain('orderBy: $orderBy');
    expect(GET_FORECASTS_PAGINATED_QUERY).toContain('hasNextPage');
    expect(GET_FORECASTS_PAGINATED_QUERY).toContain('endCursor');
    expect(GET_FORECASTS_PAGINATED_QUERY).not.toContain('skip');
    expect(GET_FORECASTS_PAGINATED_QUERY).not.toContain('cursor:');
    expect(GET_FORECASTS_PAGINATED_QUERY).not.toMatch(/\bid\b/);
  });
});

// ============================================================================
// formatAttestationData
// ============================================================================

describe('formatAttestationData', () => {
  test('maps value straight through', () => {
    expect(formatAttestationData(makeNode()).value).toBe('75');
  });

  test('keys id on the EAS uid (no numeric row id)', () => {
    const result = formatAttestationData(makeNode());
    expect(result.id).toBe('0xabc123');
    expect(result.uid).toBe('0xabc123');
  });

  test('maps attestedAt to rawTime (epoch seconds)', () => {
    expect(formatAttestationData(makeNode()).rawTime).toBe(1700000000);
  });

  test('shortens attester to first 6 + last 4 chars', () => {
    expect(formatAttestationData(makeNode()).shortAttester).toBe(
      '0x1234...5678'
    );
  });

  test('converts attestedAt to a locale string for display', () => {
    const result = formatAttestationData(makeNode());
    expect(typeof result.time).toBe('string');
    expect(result.time.length).toBeGreaterThan(0);
  });

  test('preserves passthrough fields', () => {
    const result = formatAttestationData(makeNode());
    expect(result.attester).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.comment).toBe('I think yes');
    expect(result.conditionId).toBe('0xcond1');
  });

  test('null comment becomes empty string (comment is nullable)', () => {
    expect(formatAttestationData(makeNode({ comment: null })).comment).toBe('');
  });

  test('null conditionId becomes undefined (conditionId is nullable)', () => {
    expect(
      formatAttestationData(makeNode({ conditionId: null })).conditionId
    ).toBeUndefined();
  });

  test('handles short attester addresses', () => {
    expect(
      formatAttestationData(makeNode({ attester: '0x1234' })).shortAttester
    ).toBe('0x1234...1234');
  });
});

// ============================================================================
// generateForecastsQueryKey
// ============================================================================

describe('generateForecastsQueryKey', () => {
  test('uses default schema UID when not provided', () => {
    const key = generateForecastsQueryKey({});
    expect(key[0]).toBe('attestations');
    expect(key[1]).toBe(DEFAULT_SCHEMA_UID);
  });

  test('uses custom schema UID', () => {
    expect(generateForecastsQueryKey({ schemaId: '0xcustom' })[1]).toBe(
      '0xcustom'
    );
  });

  test('uses null for missing optional fields', () => {
    const key = generateForecastsQueryKey({});
    expect(key[2]).toBeNull(); // attesterAddress
    expect(key[3]).toBeNull(); // chainId
    expect(key[4]).toBeNull(); // conditionId
  });

  test('includes provided values', () => {
    const key = generateForecastsQueryKey({
      attesterAddress: '0xabc',
      chainId: 42161,
      conditionId: 'cond-1',
    });
    expect(key[2]).toBe('0xabc');
    expect(key[3]).toBe(42161);
    expect(key[4]).toBe('cond-1');
  });

  test('produces consistent keys for same params', () => {
    const params = { attesterAddress: '0xabc', chainId: 1 };
    expect(generateForecastsQueryKey(params)).toEqual(
      generateForecastsQueryKey(params)
    );
  });
});

// ============================================================================
// fetchForecasts
// ============================================================================

describe('fetchForecasts', () => {
  test('defaults filter.schemaId to the forecast schema UID', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: { nodes: [] } });
    await fetchForecasts({});
    const [doc, vars] = mockGraphqlRequest.mock.calls[0];
    expect(doc).toBe(GET_FORECASTS_QUERY);
    expect(vars.filter.schemaId).toBe(DEFAULT_SCHEMA_UID);
  });

  test('requests 25 rows per page (connection max page size) starting at cursor null', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: { nodes: [] } });
    await fetchForecasts({});
    expect(mockGraphqlRequest.mock.calls[0][1].first).toBe(25);
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBeNull();
  });

  test('loops over cursor pages until hasNextPage is false, concatenating nodes', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce({
        forecasts: {
          nodes: [makeNode({ uid: '0xpage1' })],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        forecasts: {
          nodes: [makeNode({ uid: '0xpage2' })],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchForecasts({});

    expect(result.map((r) => r.uid)).toEqual(['0xpage1', '0xpage2']);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBeNull();
    expect(mockGraphqlRequest.mock.calls[1][1].after).toBe('cursor-1');
  });

  test('stops after one page when hasNextPage is false even with an endCursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      forecasts: {
        nodes: [makeNode()],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
      },
    });
    const result = await fetchForecasts({});
    expect(result).toHaveLength(1);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('normalizes attester address with EIP-55 checksum', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: { nodes: [] } });
    await fetchForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(mockGraphqlRequest.mock.calls[0][1].filter.attester).toBe(
      '0x1234567890AbcdEF1234567890aBcdef12345678'
    );
  });

  test('keeps an unparseable attester address as provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: { nodes: [] } });
    await fetchForecasts({ attesterAddress: 'not-an-address' });
    expect(mockGraphqlRequest.mock.calls[0][1].filter.attester).toBe(
      'not-an-address'
    );
  });

  test('maps single conditionId onto the conditionIds list filter', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: { nodes: [] } });
    await fetchForecasts({ conditionId: '0xcond1' });
    expect(mockGraphqlRequest.mock.calls[0][1].filter.conditionIds).toEqual([
      '0xcond1',
    ]);
  });

  test('returns nodes mapped through formatAttestationData', async () => {
    mockGraphqlRequest.mockResolvedValue({
      forecasts: { nodes: [makeNode()] },
    });
    const result = await fetchForecasts({});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('0xabc123');
    expect(result[0].value).toBe('75');
    expect(result[0].rawTime).toBe(1700000000);
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchForecasts({})).rejects.toThrow(
      'Failed to fetch forecasts: Invalid response structure'
    );
  });
});

// ============================================================================
// fetchForecastsPage
// ============================================================================

describe('fetchForecastsPage', () => {
  const page = (overrides: Record<string, unknown> = {}) => ({
    forecasts: {
      nodes: [makeNode()],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
      ...overrides,
    },
  });

  test('sends first with explicit ATTESTED_AT DESC by default', async () => {
    mockGraphqlRequest.mockResolvedValue(page());
    await fetchForecastsPage({}, { first: 20 });
    const [doc, vars] = mockGraphqlRequest.mock.calls[0];
    expect(doc).toBe(GET_FORECASTS_PAGINATED_QUERY);
    expect(vars.first).toBe(20);
    expect(vars.after).toBeNull();
    expect(vars.orderBy).toEqual({ field: 'ATTESTED_AT', direction: 'DESC' });
  });

  test('threads the after cursor', async () => {
    mockGraphqlRequest.mockResolvedValue(page());
    await fetchForecastsPage({}, { first: 20, after: 'cursor-0' });
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBe('cursor-0');
  });

  test('supports ascending direction', async () => {
    mockGraphqlRequest.mockResolvedValue(page());
    await fetchForecastsPage({}, { first: 20, orderDirection: 'asc' });
    expect(mockGraphqlRequest.mock.calls[0][1].orderBy).toEqual({
      field: 'ATTESTED_AT',
      direction: 'ASC',
    });
  });

  test('returns formatted items plus pageInfo', async () => {
    mockGraphqlRequest.mockResolvedValue(page());
    const result = await fetchForecastsPage({}, { first: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].uid).toBe('0xabc123');
    expect(result.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: 'cursor-1',
    });
  });

  test('normalizes a missing endCursor to null', async () => {
    mockGraphqlRequest.mockResolvedValue(
      page({ pageInfo: { hasNextPage: false } })
    );
    const result = await fetchForecastsPage({}, { first: 20 });
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue({ forecasts: null });
    await expect(fetchForecastsPage({}, { first: 20 })).rejects.toThrow(
      'Failed to fetch forecasts: Invalid response structure'
    );
  });
});

// ============================================================================
// fetchUserForecasts
// ============================================================================

describe('fetchUserForecasts', () => {
  test('filters by attester and returns a formatted page', async () => {
    mockGraphqlRequest.mockResolvedValue({
      forecasts: {
        nodes: [makeNode({ value: '80' })],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      first: 10,
      orderDirection: 'desc',
    });

    const vars = mockGraphqlRequest.mock.calls[0][1];
    expect(vars.filter.attester).toBe(
      '0x1234567890AbcdEF1234567890aBcdef12345678'
    );
    expect(vars.filter.schemaId).toBe(DEFAULT_SCHEMA_UID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].value).toBe('80');
    expect(result.items[0].shortAttester).toBe('0x1234...5678');
  });

  test('passes after cursor and ascending direction', async () => {
    mockGraphqlRequest.mockResolvedValue({
      forecasts: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      first: 10,
      after: 'cursor-5',
      orderDirection: 'asc',
    });

    const vars = mockGraphqlRequest.mock.calls[0][1];
    expect(vars.after).toBe('cursor-5');
    expect(vars.first).toBe(10);
    expect(vars.orderBy).toEqual({ field: 'ATTESTED_AT', direction: 'ASC' });
  });

  test('returns empty items when the page has no nodes', async () => {
    mockGraphqlRequest.mockResolvedValue({
      forecasts: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      first: 10,
      orderDirection: 'desc',
    });
    expect(result.items).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });
});
