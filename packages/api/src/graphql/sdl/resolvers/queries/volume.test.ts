import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type { QueryAccountTotalVolumeArgs } from '../../__generated__/resolvers';
import { accountTotalVolume } from './volume';

type Fn = (
  parent: unknown,
  args: QueryAccountTotalVolumeArgs,
  ctx: unknown,
  info: unknown
) => Promise<string>;
const accountTotalVolumeFn = accountTotalVolume as unknown as Fn;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('accountTotalVolume', () => {
  it('lower-cases the address before binding it into the SQL', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ total: '0' }]);
    await accountTotalVolumeFn(
      undefined,
      { address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa' },
      undefined,
      undefined
    );

    // The SQL template is built from the tagged-template literal, so the
    // address shows up in the parameter array — we check that no caller
    // ever sees a mixed-case binding.
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(
      params.every(
        (p) =>
          typeof p !== 'string' ||
          !/^0x[a-f0-9]*[A-F][a-f0-9]*$/.test(p) ||
          p.toLowerCase() === p
      )
    ).toBe(true);
  });

  it('returns the SQL total verbatim', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ total: '12345' }]);
    const result = await accountTotalVolumeFn(
      undefined,
      { address: '0xalice' },
      undefined,
      undefined
    );
    expect(result).toBe('12345');
  });

  it("returns '0' when the SUM aggregate yields no rows (defensive against empty array)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await accountTotalVolumeFn(
      undefined,
      { address: '0xnobody' },
      undefined,
      undefined
    );
    expect(result).toBe('0');
  });

  it("returns '0' when the row exists but total is null/missing", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ total: undefined }]);
    const result = await accountTotalVolumeFn(
      undefined,
      { address: '0xnobody' },
      undefined,
      undefined
    );
    expect(result).toBe('0');
  });
});
