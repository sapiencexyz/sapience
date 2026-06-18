import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const { listSponsorships } = vi.hoisted(() => ({
  listSponsorships: vi.fn(),
}));

vi.mock('../sponsorship.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sponsorship.js')>();
  return { ...actual, listSponsorships };
});

import { handleApi } from '../handler.js';

describe('GET /api/admin/sponsorships', () => {
  it('returns 401 without admin auth', async () => {
    const res = mockRes();
    await handleApi(
      { method: 'GET', headers: {} } as IncomingMessage,
      res,
      new URL('http://localhost/api/admin/sponsorships?network=main'),
    );
    expect(res.status).toBe(401);
    expect(listSponsorships).not.toHaveBeenCalled();
  });

  it('returns sponsorship history for admin token', async () => {
    listSponsorships.mockResolvedValueOnce({
      sponsorAddress: '0x52Ec7ba755d65d469188ee56Eec44ea88975b24c',
      bankrollWei: '100000000000000000000',
      rows: [],
    });
    const res = mockRes();
    await handleApi(
      {
        method: 'GET',
        headers: { authorization: 'Bearer test-admin-token' },
      } as IncomingMessage,
      res,
      new URL('http://localhost/api/admin/sponsorships?network=main'),
    );
    expect(res.status).toBe(200);
    expect(listSponsorships).toHaveBeenCalledWith('main');
    expect(JSON.parse(res.body!)).toEqual({
      sponsorAddress: '0x52Ec7ba755d65d469188ee56Eec44ea88975b24c',
      bankrollWei: '100000000000000000000',
      rows: [],
    });
  });
});

function mockRes(): ServerResponse & { status?: number; body?: string } {
  const res = {
    status: undefined as number | undefined,
    body: undefined as string | undefined,
    writeHead(status: number) {
      this.status = status;
    },
    end(payload?: string) {
      this.body = payload;
    },
  };
  return res as ServerResponse & { status?: number; body?: string };
}
