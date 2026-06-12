// Server-side restore of the session the frontend serializes
// (packages/bingo/src/lib/session/sessionKeyManager.ts). The session key's
// call policy only permits wUSDe deposit/approve(escrow) and escrow
// mint/redeem — the backend can turn the player's balance into the player's
// positions and nothing else. Sessions carry their chainId, and every
// restore is pinned to the network the request claims to be for.

import { createPublicClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  type KernelAccountClient,
} from '@zerodev/sdk';
import { deserializePermissionAccount } from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { env } from './config.js';
import { NETWORK_CONFIG, type Network } from './network.js';
import type { SerializedSession } from './types.js';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

export function chainFor(network: Network): Chain {
  return NETWORK_CONFIG[network].chain;
}

export function getPublicClient(network: Network) {
  const chain = chainFor(network);
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
}

export function zeroDevUrl(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${env.ZERODEV_PROJECT_ID}/chain/${chainId}`;
}

export function validateSerializedSession(
  s: SerializedSession,
  network: Network,
): string | null {
  // The session must be for the network this request claims to act on —
  // a staging session can never drive mainnet funds or vice versa.
  if (s.chainId !== chainFor(network).id) {
    return `session chainId ${s.chainId} is not ${network}`;
  }
  if (!s.etherealApproval) return 'missing approval';
  if (!s.sessionPrivateKey?.startsWith('0x')) return 'missing session key';
  if (!s.config?.smartAccountAddress) return 'missing smart account address';
  if (Date.now() > s.config.expiresAt) return 'session expired';
  return null;
}

export async function restoreSessionClient(
  serialized: SerializedSession,
  network: Network,
): Promise<KernelAccountClient> {
  const err = validateSerializedSession(serialized, network);
  if (err) throw new Error(`Invalid session: ${err}`);
  const chain = chainFor(network);

  const publicClient = getPublicClient(network);
  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  const account = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner,
  );

  if (
    account.address.toLowerCase() !==
    serialized.config.smartAccountAddress.toLowerCase()
  ) {
    throw new Error('Session account does not match claimed smart account');
  }

  const url = zeroDevUrl(chain.id);
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(url),
  });
  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(url),
    paymaster: {
      getPaymasterData: async (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });
}
