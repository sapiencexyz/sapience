import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Forecast } from './Forecast';
import { forecast, forecasts } from './queries/forecast';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const UID =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('Forecast (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.attestation.findMany.mockResolvedValue([]);
    mockPrisma.attestation.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Forecast:<uid>', async () => {
    const id = await callResolver<string>(Forecast.id)(
      { uid: UID },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Forecast', id: UID });
  });

  it('maps Prisma column names to v2 public names', async () => {
    const row = {
      uid: UID,
      attester: '0xabc',
      time: 1700000000,
      forecast: '5',
    };
    expect(
      await callResolver<string>(Forecast.forecaster)(row, {}, {}, null)
    ).toBe('0xabc');
    expect(
      await callResolver<number>(Forecast.attestedAt)(row, {}, {}, null)
    ).toBe(1700000000);
    expect(
      await callResolver<bigint>(Forecast.forecastValue)(row, {}, {}, null)
    ).toBe(5n);
  });

  it('forecast(uid:) returns null when not found', async () => {
    mockPrisma.attestation.findUnique.mockResolvedValueOnce(null);
    const result = await callResolver(forecast)(null, { uid: UID }, {}, null);
    expect(result).toBeNull();
  });

  it('forecasts(...) applies forecaster + condition filters', async () => {
    await callResolver(forecasts)(
      null,
      {
        first: 50,
        filter: {
          forecaster: '0xABC',
          conditionId: '0xCONDITION',
        },
      },
      {},
      null
    );
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attester: '0xabc',
          conditionId: '0xcondition',
        }),
      })
    );
  });
});
