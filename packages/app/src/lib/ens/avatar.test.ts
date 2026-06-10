/**
 * Regression tests for sanitizeAvatarUrl (bug 68297).
 *
 * The important behavior is blocking attacker-controlled URLs that would make
 * the server fetch private infrastructure while still allowing normal HTTPS
 * avatar URLs.
 */
import { sanitizeAvatarUrl } from './avatar';

describe('sanitizeAvatarUrl', () => {
  // --- valid URLs that should pass ---
  it('allows plain https URL', () => {
    expect(sanitizeAvatarUrl('https://example.com/avatar.png')).toBe(
      'https://example.com/avatar.png'
    );
  });

  it('allows http URL', () => {
    expect(sanitizeAvatarUrl('http://example.com/avatar.png')).toBe(
      'http://example.com/avatar.png'
    );
  });

  it('allows IPFS gateway URL', () => {
    const url = 'https://nftstorage.link/ipfs/QmFoo123';
    expect(sanitizeAvatarUrl(url)).toBe(url);
  });

  // --- protocols that should be rejected ---
  it('rejects javascript: protocol', () => {
    // eslint-disable-next-line no-script-url
    expect(sanitizeAvatarUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(sanitizeAvatarUrl('data:text/html,<h1>hi</h1>')).toBeNull();
  });

  it('rejects ipfs: protocol (raw, not gateway)', () => {
    expect(sanitizeAvatarUrl('ipfs://QmFoo123')).toBeNull();
  });

  it('rejects ftp: protocol', () => {
    expect(sanitizeAvatarUrl('ftp://example.com/file')).toBeNull();
  });

  it('rejects raw IPv4 literals, including WHATWG-normalized odd forms', () => {
    expect(sanitizeAvatarUrl('http://127.0.0.1/avatar.png')).toBeNull();
    expect(
      sanitizeAvatarUrl('http://169.254.169.254/latest/meta-data/')
    ).toBeNull();
    expect(sanitizeAvatarUrl('http://2130706433/avatar.png')).toBeNull();
  });

  it('rejects raw IPv6 literals', () => {
    expect(sanitizeAvatarUrl('http://[::1]/avatar.png')).toBeNull();
    expect(sanitizeAvatarUrl('http://[fe80::1]/avatar.png')).toBeNull();
    expect(sanitizeAvatarUrl('http://[fc00::1]/avatar.png')).toBeNull();
  });

  it('rejects cloud metadata hostnames', () => {
    expect(sanitizeAvatarUrl('http://metadata.google.internal/')).toBeNull();
    expect(sanitizeAvatarUrl('http://localhost/avatar.png')).toBeNull();
  });

  // --- null/empty handling ---
  it('returns null for null input', () => {
    expect(sanitizeAvatarUrl(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizeAvatarUrl(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeAvatarUrl('')).toBeNull();
  });

  // --- malformed URLs ---
  it('returns null for non-URL string', () => {
    expect(sanitizeAvatarUrl('not a url at all')).toBeNull();
  });

  it('returns null for bare path', () => {
    expect(sanitizeAvatarUrl('/etc/passwd')).toBeNull();
  });
});

// ── SSRF regression: the metadata fetch (not just the final image URL) must be
// host-checked. tokenURI/uri are attacker-controllable on-chain values. ──────
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

describe('getEnsAvatarUrlForAddress SSRF guard', () => {
  const OWNER = '0x1111111111111111111111111111111111111111';
  const CONTRACT = '0x2222222222222222222222222222222222222222';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ensMocks.getEnsName.mockResolvedValue('evil.eth');
    ensMocks.getEnsText.mockResolvedValue(`eip155:1/erc721:${CONTRACT}/1`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never fetches a metadata URL pointing at a link-local/internal host', async () => {
    ensMocks.readContract.mockImplementation(
      (args: { functionName: string }) => {
        if (args.functionName === 'ownerOf') return Promise.resolve(OWNER);
        if (args.functionName === 'tokenURI')
          return Promise.resolve('http://169.254.169.254/latest/meta-data/');
        return Promise.resolve(undefined);
      }
    );

    const { getEnsAvatarUrlForAddress } = await import('./avatar');
    const result = await getEnsAvatarUrlForAddress(OWNER);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still resolves the image for a metadata URL on an allowed host', async () => {
    ensMocks.readContract.mockImplementation(
      (args: { functionName: string }) => {
        if (args.functionName === 'ownerOf') return Promise.resolve(OWNER);
        if (args.functionName === 'tokenURI')
          return Promise.resolve('https://example.com/meta.json');
        return Promise.resolve(undefined);
      }
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ image: 'https://example.com/img.png' }),
    });

    const { getEnsAvatarUrlForAddress } = await import('./avatar');
    const result = await getEnsAvatarUrlForAddress(OWNER);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/meta.json');
    expect(result).toBe('https://example.com/img.png');
  });
});
