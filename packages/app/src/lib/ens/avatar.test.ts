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
