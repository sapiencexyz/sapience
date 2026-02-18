import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

type Hex = `0x${string}`;

export async function simulateTransaction(args: {
  rpc: string;
  tx: { to: Hex; data?: Hex; value?: bigint | string };
}): Promise<{ result: any }> {
  const client = createPublicClient({ transport: http(args.rpc) });
  const result = await client.call({
    to: args.tx.to,
    data: args.tx.data,
    value:
      typeof args.tx.value === 'bigint'
        ? (args.tx.value as bigint)
        : args.tx.value
        ? parseEther(args.tx.value)
        : undefined,
  } as any);
  return { result };
}

export async function submitTransaction(args: {
  rpc: string;
  privateKey?: Hex;
  account?: any;
  tx: { to: Hex; data?: Hex; value?: bigint | string };
}): Promise<{ hash: Hex }> {
  const account =
    args.account || (args.privateKey ? privateKeyToAccount(args.privateKey) : undefined);
  if (!account) throw new Error('Missing account or privateKey');
  const client = createWalletClient({ account, transport: http(args.rpc) });
  const hash = await client.sendTransaction({
    to: args.tx.to,
    data: args.tx.data,
    value:
      typeof args.tx.value === 'bigint'
        ? (args.tx.value as bigint)
        : args.tx.value
        ? parseEther(args.tx.value)
        : undefined,
  } as any);
  return { hash };
}


