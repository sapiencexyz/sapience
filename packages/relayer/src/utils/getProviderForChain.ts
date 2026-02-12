import {
  PublicClient,
  createPublicClient,
  http,
} from 'viem';
import * as viem from 'viem';
import * as viemChains from 'viem/chains';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fromRoot(relativePath: string): string {
  const repoRoot = resolve(__dirname, '../../../..');
  return resolve(repoRoot, relativePath);
}

// Load environment variables
dotenv.config({ path: fromRoot('.env') });

export const etherealChain: viem.Chain = {
  id: 5064014,
  name: 'EtherealChain',
  nativeCurrency: {
    name: 'Ethena USDe',
    symbol: 'USDe',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.CHAIN_5064014_RPC_URL || 'https://rpc.ethereal.trade'],
    },
    public: { http: ['https://rpc.ethereal.trade'] },
  },
};

export const chains: viem.Chain[] = [
  ...Object.values(viemChains),
  etherealChain,
];

export function getChainById(id: number): viem.Chain | undefined {
  const chain = viem.extractChain({
    chains,
    id,
  });

  if (chain) return chain;
}

const clientMap = new Map<number, PublicClient>();

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  let newClient: PublicClient;

  switch (chainId) {
    case 13370:
      // Cannon chain - use localhost for local dev
      newClient = createPublicClient({
        chain: { id: 13370, name: 'Cannon' } as viem.Chain,
        transport: http('http://localhost:8545'),
        batch: { multicall: true },
      });
      break;
    case 5064014:
      newClient = createPublicClient({
        chain: etherealChain,
        transport: http(process.env.CHAIN_5064014_RPC_URL || 'https://rpc.ethereal.trade'),
        batch: { multicall: true },
      });
      break;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  clientMap.set(chainId, newClient);

  return newClient;
}

