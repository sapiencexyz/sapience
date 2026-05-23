import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
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

// ============================================================================
// formatAttestationData
// ============================================================================

describe('formatAttestationData', () => {
  const baseAttestation = {
    id: '42',
    uid: '0xabc123',
    attester: '0x1234567890abcdef1234567890abcdef12345678',
    time: 1700000000,
    prediction: '75',
    comment: 'I think yes',
    conditionId: 'cond-1',
  };

  test('maps prediction to value field', () => {
    const result = formatAttestationData(baseAttestation);
    expect(result.value).toBe('75');
  });

  test('converts id to string', () => {
    const result = formatAttestationData({ ...baseAttestation, id: '123' });
    expect(result.id).toBe('123');
  });

  test('shortens attester to first 6 + last 4 chars', () => {
    const result = formatAttestationData(baseAttestation);
    expect(result.shortAttester).toBe('0x1234...5678');
  });

  test('preserves raw time as number', () => {
    const result = formatAttestationData(baseAttestation);
    expect(result.rawTime).toBe(1700000000);
  });

  test('converts unix timestamp to locale string', () => {
    const result = formatAttestationData(baseAttestation);
    // The formatted time should be a non-empty string from Date.toLocaleString
    expect(typeof result.time).toBe('string');
    expect(result.time.length).toBeGreaterThan(0);
  });

  test('preserves all passthrough fields', () => {
    const result = formatAttestationData(baseAttestation);
    expect(result.uid).toBe('0xabc123');
    expect(result.attester).toBe(baseAttestation.attester);
    expect(result.comment).toBe('I think yes');
    expect(result.conditionId).toBe('cond-1');
  });

  test('handles missing conditionId', () => {
    const { conditionId: _, ...noCondition } = baseAttestation;
    const result = formatAttestationData(noCondition);
    expect(result.conditionId).toBeUndefined();
  });

  test('handles short attester addresses', () => {
    const result = formatAttestationData({
      ...baseAttestation,
      attester: '0x1234',
    });
    // slice(0,6) = '0x1234', slice(-4) = '1234'
    expect(result.shortAttester).toBe('0x1234...1234');
  });
});

// ============================================================================
// generateForecastsQueryKey
// ============================================================================

describe('generateForecastsQueryKey', () => {
  test('uses default schema UID when not provided', () => {
    const key = generateForecastsQueryKey({});
    expect(key[0]).toBe('attestations');
    expect(key[1]).toBe(
      '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49'
    );
  });

  test('uses custom schema UID', () => {
    const key = generateForecastsQueryKey({ schemaId: '0xcustom' });
    expect(key[1]).toBe('0xcustom');
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
    const key1 = generateForecastsQueryKey(params);
    const key2 = generateForecastsQueryKey(params);
    expect(key1).toEqual(key2);
  });
});

// ============================================================================
// fetchForecasts
// ============================================================================

describe('fetchForecasts', () => {
  test('uses default schema UID', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecasts({});
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].where.schemaId.equals).toBe(
      '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49'
    );
  });

  test('requests max 100 attestations', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecasts({});
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(100);
  });

  test('normalizes attester address with EIP-55 checksum', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    const attesterFilter = call[1].where.AND[0];
    // viem getAddress returns EIP-55 checksummed version
    expect(attesterFilter.attester.equals).toBe(
      '0x1234567890AbcdEF1234567890aBcdef12345678'
    );
  });

  test('includes conditionId filter when provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecasts({ conditionId: 'cond-1' });
    const call = mockGraphqlRequest.mock.calls[0];
    const condFilter = call[1].where.AND[0];
    expect(condFilter.conditionId.equals).toBe('cond-1');
  });

  test('returns raw response', async () => {
    const response = { attestations: [{ id: '1' }] };
    mockGraphqlRequest.mockResolvedValue(response);
    const result = await fetchForecasts({});
    expect(result).toEqual(response);
  });
});

// ============================================================================
// fetchForecastsPage
// ============================================================================

describe('fetchForecastsPage', () => {
  test('sends take and orderBy', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecastsPage({}, { take: 20 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(20);
    expect(call[1].orderBy).toEqual([{ time: 'desc' }]);
  });

  test('includes cursor and skip=1 when cursorId provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecastsPage({}, { take: 20, cursorId: 42 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].cursor).toEqual({ id: 42 });
    expect(call[1].skip).toBe(1);
  });

  test('omits cursor when cursorId not provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchForecastsPage({}, { take: 20 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].cursor).toBeUndefined();
    expect(call[1].skip).toBeUndefined();
  });
});

// ============================================================================
// fetchUserForecasts
// ============================================================================

describe('fetchUserForecasts', () => {
  test('formats attestations through formatAttestationData', async () => {
    mockGraphqlRequest.mockResolvedValue({
      attestations: [
        {
          id: '1',
          uid: '0xabc',
          attester: '0x1234567890abcdef1234567890abcdef12345678',
          time: 1700000000,
          prediction: '80',
          comment: 'test',
        },
      ],
    });

    const result = await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      take: 10,
      skip: 0,
      orderBy: 'time',
      orderDirection: 'desc',
    });

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('80'); // mapped from prediction
    expect(result[0].shortAttester).toBe('0x1234...5678');
  });

  test('passes orderBy and orderDirection', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      take: 10,
      skip: 5,
      orderBy: 'time',
      orderDirection: 'asc',
    });

    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].orderBy).toEqual([{ time: 'asc' }]);
    expect(call[1].take).toBe(10);
    expect(call[1].skip).toBe(5);
  });

  test('returns empty array when no attestations', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: [] });
    const result = await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      take: 10,
      skip: 0,
      orderBy: 'time',
      orderDirection: 'desc',
    });
    expect(result).toEqual([]);
  });

  test('handles null attestations response', async () => {
    mockGraphqlRequest.mockResolvedValue({ attestations: null });
    const result = await fetchUserForecasts({
      attesterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      take: 10,
      skip: 0,
      orderBy: 'time',
      orderDirection: 'desc',
    });
    expect(result).toEqual([]);
  });
});
