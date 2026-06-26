import { type PublicClient, createPublicClient, http } from 'viem';
import { getChainConfig } from '@sapience/sdk/constants';

const clientMap = new Map<number, PublicClient>();

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  const chain = getChainConfig(chainId);
  const newClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
    batch: { multicall: true },
  });

  clientMap.set(chainId, newClient);

  return newClient;
}
