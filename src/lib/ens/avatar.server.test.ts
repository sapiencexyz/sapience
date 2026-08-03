/**
 * SSRF regression for the Node-only avatar resolver (avatar.server).
 *
 * The shared module blocks raw IP literals and known-bad hostnames statically.
 * This module adds the DNS-rebinding guard: a *domain* that passes the static
 * checks but resolves to a private/internal address must NOT be fetched. That
 * guard needs Node DNS, so it only exists here — the edge runtime can't run it,
 * which is why the OG profile route is pinned to runtime = 'nodejs'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  lookup: dnsMocks.lookup,
  default: { lookup: dnsMocks.lookup },
}));

const ensMocks = vi.hoisted(() => ({
  getEnsName: vi.fn(),
  getEnsText: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock('~/lib/utils/util', () => ({
  mainnetClient: {
    getEnsName: ensMocks.getEnsName,
    getEnsText: ensMocks.getEnsText,
    readContract: ensMocks.readContract,
  },
  getPublicClientForChainId: () => ({ readContract: ensMocks.readContract }),
}));

describe('avatar.server getEnsAvatarUrlForAddress DNS SSRF guard', () => {
  const OWNER = '0x1111111111111111111111111111111111111111';
  const CONTRACT = '0x2222222222222222222222222222222222222222';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ensMocks.getEnsName.mockResolvedValue('evil.eth');
    ensMocks.getEnsText.mockResolvedValue(`eip155:1/erc721:${CONTRACT}/1`);
    ensMocks.readContract.mockImplementation(
      (args: { functionName: string }) => {
        if (args.functionName === 'ownerOf') return Promise.resolve(OWNER);
        // A domain that passes the static host checks — only DNS reveals it.
        if (args.functionName === 'tokenURI')
          return Promise.resolve('https://rebind.attacker.test/meta.json');
        return Promise.resolve(undefined);
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks a metadata domain that DNS-resolves to a private address', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const { getEnsAvatarUrlForAddress } = await import('./avatar.server');
    const result = await getEnsAvatarUrlForAddress(OWNER);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dnsMocks.lookup).toHaveBeenCalledWith(
      'rebind.attacker.test',
      expect.objectContaining({ all: true })
    );
  });

  it('fails closed when the DNS lookup itself errors', async () => {
    dnsMocks.lookup.mockRejectedValue(new Error('ENOTFOUND'));

    const { getEnsAvatarUrlForAddress } = await import('./avatar.server');
    const result = await getEnsAvatarUrlForAddress(OWNER);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the image when the metadata domain resolves to a public address', async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ image: 'https://cdn.example.com/img.png' }),
    });

    const { getEnsAvatarUrlForAddress } = await import('./avatar.server');
    const result = await getEnsAvatarUrlForAddress(OWNER);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://rebind.attacker.test/meta.json'
    );
    expect(result).toBe('https://cdn.example.com/img.png');
  });
});
