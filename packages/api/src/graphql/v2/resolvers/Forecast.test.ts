import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fromGlobalIdV2,
  resolveNodeV2,
  toGlobalIdV2,
} from '../relay/nodeRegistry';
import { decodeCursor, encodeCursor } from '../relay/cursor';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  condition: { findUnique: vi.fn() },
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
  '0xba3aec08b03e403900140ca733f2ac46441d16d93a1818bd3f89a811bc663cfe';
const CONDITION_ID =
  '0xd897104f3c685a63635ca5b9ab290f8ed4308b57dd215bc4b3d85d5a31c7b110';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  uid: UID,
  attester: '0xFed214CCe9CC6F7Ceb507De9fdf00a3899592caA',
  conditionId: CONDITION_ID,
  prediction: '73000000000000000000',
  comment: 'Test Forecast!',
  schemaId:
    '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49',
  time: 1772473980,
  ...overrides,
});

describe('Forecast (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.attestation.findMany.mockResolvedValue([]);
    mockPrisma.attestation.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Forecast:<uid>', async () => {
    const id = await callResolver<string>(Forecast.id)(row(), {}, {}, null);
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Forecast', id: UID });
  });

  it('value maps the prediction column (probability string, not an outcome)', async () => {
    const value = await callResolver<string>(Forecast.value)(
      row(),
      {},
      {},
      null
    );
    expect(value).toBe('73000000000000000000');
  });

  it('attestedAt maps the time column', async () => {
    const attestedAt = await callResolver<number>(Forecast.attestedAt)(
      row(),
      {},
      {},
      null
    );
    expect(attestedAt).toBe(1772473980);
  });

  it('forecast(uid:) lowercases the lookup', async () => {
    await callResolver(forecast)(null, { uid: UID.toUpperCase() }, {}, null);
    expect(mockPrisma.attestation.findUnique).toHaveBeenCalledWith({
      where: { uid: UID },
    });
  });

  it('node() refetches a Forecast by its uid-keyed global id', async () => {
    const id = toGlobalIdV2('Forecast', UID);
    await resolveNodeV2(id, {});
    expect(mockPrisma.attestation.findUnique).toHaveBeenCalledWith({
      where: { uid: UID },
    });
  });

  it('forecasts() defaults to ATTESTED_AT DESC with the (time, uid) keyset order', async () => {
    await callResolver(forecasts)(null, { first: 50 }, {}, null);
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ time: 'desc' }, { uid: 'desc' }],
        take: 26,
      })
    );
  });

  it('forecasts(filter: { attester }) matches case-insensitively (column stores checksummed addresses)', async () => {
    await callResolver(forecasts)(
      null,
      {
        first: 50,
        filter: { attester: '0xfed214cce9cc6f7ceb507de9fdf00a3899592caa' },
      },
      {},
      null
    );
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attester: {
            equals: '0xfed214cce9cc6f7ceb507de9fdf00a3899592caa',
            mode: 'insensitive',
          },
        }),
      })
    );
  });

  it('forecasts(filter: { conditionIds }) translates to a lowercased `conditionId in [...]`', async () => {
    await callResolver(forecasts)(
      null,
      { first: 50, filter: { conditionIds: [CONDITION_ID.toUpperCase()] } },
      {},
      null
    );
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conditionId: { in: [CONDITION_ID] },
        }),
      })
    );
  });

  it('forecasts(filter: { schemaId }) lowercases the match', async () => {
    const schemaId =
      '0x7DF55BCEC6EB3B17B25C503CC318A36D33B0A9BBC2D6BC0D9788F9BD61980D49';
    await callResolver(forecasts)(
      null,
      { first: 50, filter: { schemaId } },
      {},
      null
    );
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schemaId: schemaId.toLowerCase(),
        }),
      })
    );
  });

  it('forecasts(after:) applies the (time, uid) keyset predicate', async () => {
    const after = encodeCursor({ k: '1772473980', id: UID });
    await callResolver(forecasts)(null, { first: 50, after }, {}, null);
    expect(mockPrisma.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {},
            {
              OR: [
                { time: { lt: 1772473980 } },
                {
                  AND: [{ time: { equals: 1772473980 } }, { uid: { lt: UID } }],
                },
              ],
            },
          ],
        },
      })
    );
  });

  it('forecasts() edge cursors encode (time, uid) so paging is stable across equal timestamps', async () => {
    const rows = [
      row({ uid: '0xaaa', time: 100 }),
      row({ uid: '0xbbb', time: 100 }),
    ];
    mockPrisma.attestation.findMany.mockResolvedValue(rows);
    const connection = await callResolver<{
      edges: { cursor: string; node: unknown }[];
    }>(forecasts)(null, { first: 50 }, {}, null);
    expect(connection.edges.map((e) => decodeCursor(e.cursor))).toEqual([
      { k: '100', id: '0xaaa' },
      { k: '100', id: '0xbbb' },
    ]);
  });

  it('condition resolves through the conditionById loader with a lowercased key', async () => {
    const load = vi.fn().mockResolvedValue({ id: CONDITION_ID });
    const ctx = { loaders: { conditionById: { load } } };
    const result = await callResolver<{ id: string } | null>(
      Forecast.condition
    )(row({ conditionId: CONDITION_ID.toUpperCase() }), {}, ctx, null);
    expect(load).toHaveBeenCalledWith(CONDITION_ID);
    expect(result?.id).toBe(CONDITION_ID);
  });

  it('condition falls back to direct prisma when no loader is present', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({ id: CONDITION_ID });
    const result = await callResolver<{ id: string } | null>(
      Forecast.condition
    )(row(), {}, {}, null);
    expect(mockPrisma.condition.findUnique).toHaveBeenCalledWith({
      where: { id: CONDITION_ID },
    });
    expect(result?.id).toBe(CONDITION_ID);
  });

  it('condition is null when the row has a null conditionId', async () => {
    const load = vi.fn();
    const ctx = { loaders: { conditionById: { load } } };
    const result = await callResolver<unknown>(Forecast.condition)(
      row({ conditionId: null }),
      {},
      ctx,
      null
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findUnique).not.toHaveBeenCalled();
  });
});
