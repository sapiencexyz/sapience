import { lookup } from 'node:dns/promises';
import {
  getEnsAvatarUrlForAddress as resolveAvatar,
  isPrivateResolvedAddress,
  type AvatarHostGuard,
} from './avatar';

/**
 * Node-only ENS avatar resolution with full SSRF protection.
 *
 * The shared `./avatar` module is bundled for the browser and the edge runtime,
 * where `node:dns/promises` is unavailable — so DNS-rebinding defense lives
 * here and is injected as a host guard. Import this (not `./avatar`) from any
 * server-side path that fetches attacker-controlled NFT metadata. The OG
 * profile route pins itself to `runtime = 'nodejs'` so this code actually runs.
 */

/**
 * Resolve a hostname and report whether ANY record points at a private/internal
 * address. Fails closed: a lookup error blocks the fetch rather than allowing it.
 */
export const dnsHostGuard: AvatarHostGuard = async (hostname) => {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.some((record) => isPrivateResolvedAddress(record.address));
  } catch {
    return true;
  }
};

export function getEnsAvatarUrlForAddress(
  address: string
): Promise<string | null> {
  return resolveAvatar(address, dnsHostGuard);
}
