import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Account,
  type CallReturnType,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export async function simulateTransaction(args: {
  rpc: string;
  tx: { to: Hex; data?: Hex; value?: bigint | string };
}): Promise<{ result: CallReturnType }> {
  const client = createPublicClient({ transport: http(args.rpc) });
  const result = await client.call({
    to: args.tx.to,
    data: args.tx.data,
    value:
      typeof args.tx.value === 'bigint'
        ? args.tx.value
        : args.tx.value
          ? parseEther(args.tx.value)
          : undefined,
  });
  return { result };
}

export async function submitTransaction(args: {
  rpc: string;
  privateKey?: Hex;
  account?: Account;
  tx: { to: Hex; data?: Hex; value?: bigint | string };
}): Promise<{ hash: Hex }> {
  const account =
    args.account ||
    (args.privateKey ? privateKeyToAccount(args.privateKey) : undefined);
  if (!account) throw new Error('Missing account or privateKey');
  const client = createWalletClient({ account, transport: http(args.rpc) });
  const hash = await client.sendTransaction({
    chain: null,
    to: args.tx.to,
    data: args.tx.data,
    value:
      typeof args.tx.value === 'bigint'
        ? args.tx.value
        : args.tx.value
          ? parseEther(args.tx.value)
          : undefined,
  });
  return { hash };
}
