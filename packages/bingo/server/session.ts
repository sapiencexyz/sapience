// Server-side restore of the session the frontend serializes
// (packages/bingo/src/lib/session/sessionKeyManager.ts). The session key's
// call policy only permits wUSDe deposit/approve(escrow) and escrow
// mint/redeem — the backend can turn the player's balance into the player's
// positions and nothing else.

import { createPublicClient, http } from 'viem';
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

export const CHAIN = NETWORK_CONFIG[env.NETWORK as Network].chain;
export const CHAIN_ID = CHAIN.id;

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

export function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(CHAIN.rpcUrls.default.http[0]),
  });
}

export function zeroDevUrl(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${env.ZERODEV_PROJECT_ID}/chain/${chainId}`;
}

export function validateSerializedSession(s: SerializedSession): string | null {
  if (s.chainId !== CHAIN_ID) return `wrong chainId ${s.chainId}`;
  if (!s.etherealApproval) return 'missing approval';
  if (!s.sessionPrivateKey?.startsWith('0x')) return 'missing session key';
  if (!s.config?.smartAccountAddress) return 'missing smart account address';
  if (Date.now() > s.config.expiresAt) return 'session expired';
  return null;
}

export async function restoreSessionClient(
  serialized: SerializedSession,
): Promise<KernelAccountClient> {
  const err = validateSerializedSession(serialized);
  if (err) throw new Error(`Invalid session: ${err}`);

  const publicClient = getPublicClient();
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

  const url = zeroDevUrl(CHAIN_ID);
  const paymasterClient = createZeroDevPaymasterClient({
    chain: CHAIN,
    transport: http(url),
  });
  return createKernelAccountClient({
    account,
    chain: CHAIN,
    bundlerTransport: http(url),
    paymaster: {
      getPaymasterData: async (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });
}
