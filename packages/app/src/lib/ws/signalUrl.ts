const SIGNAL_KEY = 'sapience.settings.signalEndpoint';

/**
 * Resolve the signal WebSocket URL.
 * Reads the persisted signal endpoint from settings (http(s)) and converts to ws(s).
 * Falls back to deriving from the relayer base URL or hardcoded production default.
 *
 * Returns '' when the mesh is explicitly disabled — i.e. the signal endpoint
 * setting is present in localStorage but blank. Callers treat an empty string
 * as "do not connect to the mesh". This explicit disable wins over every other
 * source (including the env override) so turning the mesh off in Settings always
 * takes effect.
 *
 * Priority:
 * 0. Explicit disable: localStorage signal endpoint present but blank → '' (no mesh)
 * 1. NEXT_PUBLIC_SIGNAL_URL env override
 * 2. localStorage signal endpoint (sapience.settings.signalEndpoint)
 * 3. localStorage relayer base (sapience.settings.apiBaseUrl) with /signal path
 * 4. NEXT_PUBLIC_FOIL_RELAYER_URL env with /signal path
 * 5. NEXT_PUBLIC_FOIL_API_URL with hostname swap + /signal path
 * 6. Nothing configured → '' (Robinhood Mainnet default disables the mesh)
 */
export function getSignalUrl(): string {
  // Explicit disable wins over everything: an empty (but present) signal
  // endpoint setting means "don't connect to the mesh".
  try {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(SIGNAL_KEY)
        : null;
    if (stored !== null && stored.trim() === '') return '';
  } catch {
    /* */
  }

  const explicit = process.env.NEXT_PUBLIC_SIGNAL_URL;
  if (explicit) return explicit;

  try {
    // Prefer the dedicated signal endpoint setting
    const signalStored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(SIGNAL_KEY)
        : null;

    if (signalStored) {
      const u = new URL(signalStored);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString();
    }

    // Fall back: derive from relayer base (same logic as SettingsContext)
    const relayerStored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('sapience.settings.apiBaseUrl')
        : null;
    const explicitRelayer = process.env.NEXT_PUBLIC_FOIL_RELAYER_URL;
    const apiRoot = process.env.NEXT_PUBLIC_FOIL_API_URL;
    const base = relayerStored || explicitRelayer || apiRoot;
    // Nothing configured → Robinhood Mainnet default, which disables the mesh.
    if (!base) return '';

    const u = new URL(base);
    if (
      !relayerStored &&
      !explicitRelayer &&
      u.hostname === 'api.sapience.xyz'
    ) {
      u.hostname = 'relayer.sapience.xyz';
    }
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/signal';
    u.search = '';
    return u.toString();
  } catch {
    /* */
  }

  // Default network (Robinhood Mainnet) ships with the mesh disabled.
  return '';
}
