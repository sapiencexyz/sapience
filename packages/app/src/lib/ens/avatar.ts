import { isAddress } from 'viem';
import type { Address } from 'viem';
import { mainnetClient, getPublicClientForChainId } from '~/lib/utils/util';

/**
 * Resolves true when a hostname must NOT be fetched (SSRF). This module is
 * bundled for the browser and the edge runtime, neither of which can do DNS
 * resolution, so the DNS-based guard is injected by Node-only callers
 * (see `avatar.server.ts`). When no guard is provided we rely on the static
 * hostname/IP-literal checks in `sanitizeAvatarUrl` alone.
 */
export type AvatarHostGuard = (hostname: string) => Promise<boolean>;

const NO_DNS_GUARD: AvatarHostGuard = () => Promise.resolve(false);

type ParsedCaip = {
  chainId: number;
  standard: 'erc721' | 'erc1155';
  contract: Address;
  tokenId: bigint;
};

const ERC721_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'uri', type: 'string' }],
  },
] as const;

const ERC1155_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'uri',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: 'uri', type: 'string' }],
  },
] as const;

function toHttpFromIpfs(uri: string): string {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://ipfs/')) {
    return uri.replace('ipfs://ipfs/', 'https://nftstorage.link/ipfs/');
  }
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://nftstorage.link/ipfs/');
  }
  return uri;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // WHATWG URL normalizes odd IPv4 forms (`2130706433`, `0177.0.0.1`) to
  // dotted decimal and leaves IPv6 wrapped in brackets. Raw IP avatar URLs are
  // unnecessary for ENS display and dangerous for server-side metadata fetches,
  // so block all IP literals instead of trying to maintain a private-range
  // regex zoo. Domains are still allowed and server fetches do DNS checks below.
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:.]+\]$/.test(host)
  );
}

export function isPrivateResolvedAddress(address: string): boolean {
  let host = address.toLowerCase();

  // Unwrap an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) so the IPv4 rules
  // below apply to it symmetrically. Otherwise a mapped private address whose
  // range wasn't hard-coded here (e.g. `::ffff:172.16.0.1` or a `::ffff:100.64`
  // CGNAT address) would slip past the guard.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mapped) host = mapped[1];

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [, aRaw, bRaw] = ipv4;
    const a = Number(aRaw);
    const b = Number(bRaw);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  return (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return BLOCKED_HOSTNAMES.has(host) || isIpLiteral(host);
}

export function sanitizeAvatarUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isBlockedHostname(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function safeFetchAvatarUrl(
  url: string | null | undefined,
  hostGuard: AvatarHostGuard = NO_DNS_GUARD
): Promise<string | null> {
  const safe = sanitizeAvatarUrl(url);
  if (!safe) return null;

  const hostname = new URL(safe).hostname;
  if (await hostGuard(hostname)) return null;

  return safe;
}

function hexPad64(n: bigint): string {
  const hex = n.toString(16);
  return hex.padStart(64, '0');
}

function replaceIdTemplate(uri: string, tokenId: bigint): string {
  if (!uri) return uri;
  // Common ERC1155 pattern: {id} replaced by hex, 64 chars lowercase
  const idHex = hexPad64(tokenId);
  return uri.replaceAll('{id}', idHex);
}

function parseEnsAvatarCaip(
  record: string | null | undefined
): ParsedCaip | null {
  if (!record) return null;
  // e.g. "eip155:1/erc721:0xabc.../1234" or "eip155:1/erc1155:0xabc.../1234"
  const m = /^eip155:(\d+)\/(erc721|erc1155):(.+?)\/(\d+)$/.exec(record);
  if (!m) return null;
  const chainId = Number(m[1]);
  const standard = m[2] as 'erc721' | 'erc1155';
  const contract = m[3] as Address;
  const tokenId = BigInt(m[4]);
  if (!Number.isFinite(chainId) || !isAddress(contract)) return null;
  return { chainId, standard, contract, tokenId };
}

async function fetchJson<T = unknown>(
  url: string,
  hostGuard: AvatarHostGuard = NO_DNS_GUARD
): Promise<T | null> {
  // SSRF guard: token metadata URLs come from attacker-controllable on-chain
  // tokenURI/uri values, so host-check every URL before fetching — not just the
  // final image URL. Blocks raw IP literals, cloud-metadata hostnames, DNS
  // resolutions to raw IPs/private hosts (when a Node DNS guard is injected),
  // and non-http(s) schemes.
  const safe = await safeFetchAvatarUrl(url, hostGuard);
  if (!safe) return null;
  try {
    const res = await fetch(safe, {
      cache: 'force-cache',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    return data;
  } catch {
    return null;
  }
}

async function resolveNftImageUrl(
  caip: ParsedCaip,
  ownerAddress: Address,
  hostGuard: AvatarHostGuard = NO_DNS_GUARD
): Promise<string | null> {
  const client =
    caip.chainId === 1
      ? mainnetClient
      : getPublicClientForChainId(caip.chainId);

  if (caip.standard === 'erc721') {
    // Verify ownership
    const currentOwner = await client.readContract({
      address: caip.contract,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [caip.tokenId],
    });
    if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
      return null;
    }
    const tokenUri = await client.readContract({
      address: caip.contract,
      abi: ERC721_ABI,
      functionName: 'tokenURI',
      args: [caip.tokenId],
    });
    const resolved = toHttpFromIpfs(tokenUri);
    const metadata = await fetchJson<{ image?: string }>(resolved, hostGuard);
    const image = toHttpFromIpfs(String(metadata?.image || ''));
    return image || null;
  }

  // ERC1155
  const bal = await client.readContract({
    address: caip.contract,
    abi: ERC1155_ABI,
    functionName: 'balanceOf',
    args: [ownerAddress, caip.tokenId],
  });
  if (bal <= 0n) return null;
  let uri = await client.readContract({
    address: caip.contract,
    abi: ERC1155_ABI,
    functionName: 'uri',
    args: [caip.tokenId],
  });
  uri = replaceIdTemplate(uri, caip.tokenId);
  const resolved = toHttpFromIpfs(uri);
  const metadata = await fetchJson<{ image?: string }>(resolved, hostGuard);
  const image = toHttpFromIpfs(String(metadata?.image || ''));
  return image || null;
}

export async function getEnsAvatarUrlForAddress(
  address: string,
  hostGuard: AvatarHostGuard = NO_DNS_GUARD
): Promise<string | null> {
  try {
    if (!address || !isAddress(address)) return null;
    const addr = address;
    const ensName = await mainnetClient.getEnsName({ address: addr });
    if (!ensName) return null;
    const avatarText = await mainnetClient.getEnsText({
      name: ensName,
      key: 'avatar',
    });
    if (!avatarText) return null;

    // If direct URL/IPFS CID. Run the final URL through the host guard too —
    // not just sanitize — so callers can fetch the returned URL (e.g. the OG
    // route's HEAD probe) without re-checking for DNS-rebinding SSRF.
    if (avatarText.startsWith('ipfs://') || avatarText.startsWith('http')) {
      return safeFetchAvatarUrl(toHttpFromIpfs(avatarText), hostGuard);
    }

    // If NFT CAIP string
    const parsed = parseEnsAvatarCaip(avatarText);
    if (parsed) {
      const image = await resolveNftImageUrl(parsed, addr, hostGuard);
      return safeFetchAvatarUrl(image, hostGuard);
    }
    return null;
  } catch {
    return null;
  }
}
