import { isAddress } from 'viem';
import type { Address } from 'viem';
import { mainnetClient, getPublicClientForChainId } from '~/lib/utils/util';

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

export function parseEnsAvatarCaip(
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

async function fetchJson<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    return data;
  } catch {
    return null;
  }
}

async function resolveNftImageUrl(
  caip: ParsedCaip,
  ownerAddress: Address
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
    const metadata = await fetchJson<any>(resolved);
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
  const metadata = await fetchJson<any>(resolved);
  const image = toHttpFromIpfs(String(metadata?.image || ''));
  return image || null;
}

export async function getEnsAvatarUrlForAddress(
  address: string
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

    // If direct URL/IPFS CID
    if (avatarText.startsWith('ipfs://') || avatarText.startsWith('http')) {
      return sanitizeAvatarUrl(toHttpFromIpfs(avatarText));
    }

    // If NFT CAIP string
    const parsed = parseEnsAvatarCaip(avatarText);
    if (parsed) {
      return sanitizeAvatarUrl(await resolveNftImageUrl(parsed, addr));
    }
    return null;
  } catch {
    return null;
  }
}
