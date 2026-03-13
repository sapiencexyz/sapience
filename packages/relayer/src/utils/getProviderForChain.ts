import { type PublicClient, type Chain, createPublicClient, http } from 'viem';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  getRpcUrl,
} from '@sapience/sdk/constants';

const clientMap = new Map<number, PublicClient>();

// Local chain definitions to avoid cross-package viem type mismatch.
// Chain IDs and RPC URLs are sourced from the SDK.
function buildChain(chainId: number): Chain {
  const rpcUrl = getRpcUrl(chainId);
  switch (chainId) {
    case CHAIN_ID_ETHEREAL:
      return {
        id: CHAIN_ID_ETHEREAL,
        name: 'Ethereal',
        nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      };
    case CHAIN_ID_ETHEREAL_TESTNET:
      return {
        id: CHAIN_ID_ETHEREAL_TESTNET,
        name: 'Ethereal Testnet',
        nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
        testnet: true,
      };
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  const chain = buildChain(chainId);
  const newClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
    batch: { multicall: true },
  });

  clientMap.set(chainId, newClient);

  return newClient;
}
