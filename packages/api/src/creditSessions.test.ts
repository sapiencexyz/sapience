import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  creditSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('./db', () => ({ default: mockPrisma }));

import {
  createCreditSession,
  getSession,
  deductCredits,
  extractPayerFromPaymentHeader,
} from './creditSessions';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createCreditSession', () => {
  it('calls prisma.creditSession.create with correct data', async () => {
    mockPrisma.creditSession.create.mockResolvedValue({});

    const result = await createCreditSession('0xabc', 1_000_000);

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.credits).toBe(1_000_000);

    expect(mockPrisma.creditSession.create).toHaveBeenCalledWith({
      data: {
        token: result.token,
        wallet: '0xabc',
        credits: 1_000_000,
      },
    });
  });

  it('returns different tokens for each session', async () => {
    mockPrisma.creditSession.create.mockResolvedValue({});

    const a = await createCreditSession('0xabc', 1000);
    const b = await createCreditSession('0xabc', 1000);
    expect(a.token).not.toBe(b.token);
  });
});

describe('getSession', () => {
  it('returns session for valid token', async () => {
    mockPrisma.creditSession.findUnique.mockResolvedValue({
      token: 'abc',
      wallet: '0xabc',
      credits: 5000,
    });

    const session = await getSession('abc');
    expect(session).not.toBeNull();
    expect(session!.wallet).toBe('0xabc');
    expect(session!.credits).toBe(5000);
  });

  it('returns null for unknown token', async () => {
    mockPrisma.creditSession.findUnique.mockResolvedValue(null);
    expect(await getSession('nonexistent')).toBeNull();
  });
});

describe('deductCredits', () => {
  it('returns remaining credits when UPDATE matches a row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ credits: 4995 }]);
    expect(await deductCredits('abc', 5)).toBe(4995);
  });

  it('returns null when UPDATE matches no rows (insufficient credits)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await deductCredits('abc', 5000)).toBeNull();
  });

  it('returns null for unknown token', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await deductCredits('nonexistent', 100)).toBeNull();
  });
});

describe('extractPayerFromPaymentHeader', () => {
  it('extracts from authorization.from', () => {
    const header = Buffer.from(
      JSON.stringify({ authorization: { from: '0xpayer' } })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xpayer');
  });

  it('extracts from permit2Authorization.from', () => {
    const header = Buffer.from(
      JSON.stringify({ permit2Authorization: { from: '0xpermit2payer' } })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xpermit2payer');
  });

  it('prefers authorization over permit2Authorization', () => {
    const header = Buffer.from(
      JSON.stringify({
        authorization: { from: '0xauth' },
        permit2Authorization: { from: '0xpermit2' },
      })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xauth');
  });

  it('returns null for invalid base64', () => {
    expect(extractPayerFromPaymentHeader('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for JSON without from field', () => {
    const header = Buffer.from(JSON.stringify({ foo: 'bar' })).toString(
      'base64'
    );
    expect(extractPayerFromPaymentHeader(header)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractPayerFromPaymentHeader('')).toBeNull();
  });
});
