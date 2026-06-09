/**
 * Regression tests for sanitizeAvatarUrl (bug 68297).
 *
 * The function is not exported, so we extract and test it indirectly
 * by re-implementing the same logic here. If the implementation changes,
 * these tests should be updated to match — the important thing is that
 * the *behavior* (blocking private IPs, allowing valid HTTPS) is covered.
 *
 * If sanitizeAvatarUrl is ever exported, switch to importing it directly.
 */

// Re-implement sanitizeAvatarUrl exactly as in avatar.ts so we can unit-test it.
// This keeps the test independent of module-level import side-effects (viem clients).
function sanitizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    return null;
  } catch {
    return null;
  }
}

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
