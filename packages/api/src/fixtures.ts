import { mainnet, sepolia, base, cannon, arbitrum } from 'viem/chains';
import evmIndexer from './resourcePriceFunctions/evmIndexer';
import ethBlobsIndexer from './resourcePriceFunctions/ethBlobsIndexer';
import celestiaIndexer from './resourcePriceFunctions/celestiaIndexer';
import svmIndexer from './resourcePriceFunctions/svmIndexer';
import { safeRequire } from './utils';
import btcIndexer from './resourcePriceFunctions/btcIndexer';
import { MarketInfo } from './interfaces';

const EVM_RESOURCES = [
  {
    name: 'Ethereum Gas',
    slug: 'ethereum-gas',
    priceIndexer: new evmIndexer(mainnet.id),
  },
  {
    name: 'Base Gas',
    slug: 'base-gas',
    priceIndexer: new evmIndexer(base.id),
  },
  {
    name: 'Arbitrum Gas',
    slug: 'arbitrum-gas',
    priceIndexer: new evmIndexer(arbitrum.id),
  },
  {
    name: 'Bitcoin Fees',
    slug: 'bitcoin-fees',
    priceIndexer: new btcIndexer(),
  },
  {
    name: 'Ethereum Blobspace',
    slug: 'ethereum-blobspace',
    priceIndexer: new ethBlobsIndexer(),
  },
];

const OTHER_RESOURCES = [
  ...(process.env.SOLANA_RPC_URL
    ? [
        {
          name: 'Solana Fees',
          slug: 'solana-fees',
          priceIndexer: new svmIndexer(process.env.SOLANA_RPC_URL),
        },
      ]
    : []),
  ...(process.env.CELENIUM_API_KEY
    ? [
        {
          name: 'Celestia Blobspace',
          slug: 'celestia-blobspace',
          priceIndexer: new celestiaIndexer('https://api-mainnet.celenium.io'),
        },
      ]
    : []),
];

export const RESOURCES = [...EVM_RESOURCES, ...OTHER_RESOURCES];

const MARKET_CONFIGS = [
  { chainId: base.id, environment: 'all' },
  { chainId: cannon.id, environment: 'development' },
  { chainId: sepolia.id, environment: ['staging', 'development'] },
];

const addMarketYinYang = async (markets: MarketInfo[], chainId: number) => {
  const yin = await safeRequire(
    `@/protocol/deployments/${chainId}/FoilYin.json`
  );
  const yang = await safeRequire(
    `@/protocol/deployments/${chainId}/FoilYang.json`
  );
  const yinVault = await safeRequire(
    `@/protocol/deployments/${chainId}/VaultYin.json`
  );
  const yangVault = await safeRequire(
    `@/protocol/deployments/${chainId}/VaultYang.json`
  );

  if (yin && yang && yinVault && yangVault) {
    const ethGasResource = RESOURCES.find((r) => r.slug === 'ethereum-gas');
    if (!ethGasResource) {
      throw new Error('Ethereum Gas resource not found');
    }

    markets.push(
      {
        deployment: yin,
        vaultAddress: yinVault.address,
        marketChainId: chainId,
        public: true,
        resource: ethGasResource,
        isYin: true,
      },
      {
        deployment: yang,
        vaultAddress: yangVault.address,
        marketChainId: chainId,
        public: false,
        resource: ethGasResource,
        isYin: false,
      }
    );
  }
};

const initializeMarkets = async () => {
  const FULL_MARKET_LIST: MarketInfo[] = [];

  for (const config of MARKET_CONFIGS) {
    const environments = Array.isArray(config.environment)
      ? config.environment
      : [config.environment];

    if (
      config.environment === 'all' ||
      (process.env.NODE_ENV && environments.includes(process.env.NODE_ENV))
    ) {
      await addMarketYinYang(FULL_MARKET_LIST, config.chainId);
    }
  }

  return FULL_MARKET_LIST;
};

export const MARKETS = await initializeMarkets();
