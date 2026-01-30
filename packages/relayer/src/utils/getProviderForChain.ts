import {
  PublicClient,
  createPublicClient,
  http,
  webSocket,
  type Transport,
} from 'viem';
import { mainnet, sepolia, base, arbitrum } from 'viem/chains';
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

// Custom chain definition for Converge (chainId 432)
export const convergeChain: viem.Chain = {
  id: 432,
  name: 'Converge',
  nativeCurrency: {
    name: 'Converge',
    symbol: 'CVG',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || ''] },
    public: { http: [process.env.RPC_URL || ''] },
  },
};

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

export const etherealTestnetChain: viem.Chain = {
  id: 13374202,
  name: 'Ethereal Testnet',
  nativeCurrency: {
    name: 'Ethena USDe',
    symbol: 'USDe',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.CHAIN_13374202_RPC_URL ||
          'https://testnet.ethereal.network/rpc',
      ],
    },
    public: { http: ['https://testnet.ethereal.network/rpc'] },
  },
};

export const chains: viem.Chain[] = [
  ...Object.values(viemChains),
  convergeChain,
  etherealChain,
  etherealTestnetChain,
];

export function getChainById(id: number): viem.Chain | undefined {
  const chain = viem.extractChain({
    chains,
    id,
  });

  if (chain) return chain;
}

const clientMap = new Map<number, PublicClient>();

// Added reconnection configurations from viem.
const createInfuraWebSocketTransport = (network: string): Transport => {
  if (!process.env.INFURA_API_KEY) {
    return http();
  }

  return webSocket(
    `wss://${network}.infura.io/ws/v3/${process.env.INFURA_API_KEY}`,
    {
      key: network,
      reconnect: true,
      keepAlive: true,
    }
  );
};

const createChainClient = (
  chain: viem.Chain,
  network: string,
  useLocalhost = false
) => {
  // Special handling for Converge (chainId 432)
  if (chain.id === 432 && process.env.RPC_URL) {
    return createPublicClient({
      chain,
      transport: http(process.env.RPC_URL),
      batch: {
        multicall: true,
      },
    });
  }

  if (chain.id === 5064014) {
    const rpcUrl =
      process.env.CHAIN_5064014_RPC_URL || 'https://rpc.ethereal.trade';
    return createPublicClient({
      chain,
      transport: http(rpcUrl),
      batch: {
        multicall: true,
      },
    });
  }

  if (chain.id === 13374202) {
    const rpcUrl =
      process.env.CHAIN_13374202_RPC_URL ||
      'https://testnet.ethereal.network/rpc';
    return createPublicClient({
      chain,
      transport: http(rpcUrl),
      batch: {
        multicall: true,
      },
    });
  }
  return createPublicClient({
    chain,
    transport: useLocalhost
      ? http('http://localhost:8545')
      : process.env.INFURA_API_KEY
        ? createInfuraWebSocketTransport(network)
        : http(),
    batch: {
      multicall: true,
    },
  });
};

export const mainnetPublicClient = createChainClient(mainnet, 'mainnet');
export const basePublicClient = createChainClient(base, 'base-mainnet');
export const sepoliaPublicClient = createChainClient(sepolia, 'sepolia');
export const arbitrumPublicClient = createChainClient(
  arbitrum,
  'arbitrum-mainnet'
);

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  let newClient: PublicClient;

  switch (chainId) {
    case 1:
      newClient = mainnetPublicClient;
      break;
    case 11155111:
      newClient = sepoliaPublicClient;
      break;
    case 13370:
      // Cannon chain - use localhost
      newClient = createChainClient(
        { id: 13370, name: 'Cannon' } as viem.Chain,
        'cannon',
        true
      );
      break;
    case 8453:
      newClient = basePublicClient as PublicClient;
      break;
    case 42161:
      newClient = arbitrumPublicClient as PublicClient;
      break;
    case 432:
      newClient = createChainClient(convergeChain, 'converge');
      break;
    case 5064014:
      newClient = createChainClient(etherealChain, 'ethereal');
      break;
    case 13374202:
      newClient = createChainClient(etherealTestnetChain, 'ethereal-testnet');
      break;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  clientMap.set(chainId, newClient);

  return newClient;
}

