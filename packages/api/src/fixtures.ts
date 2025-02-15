import { mainnet, sepolia, base, cannon, arbitrum } from 'viem/chains';
import evmIndexer from './resourcePriceFunctions/evmIndexer';
import ethBlobsIndexer from './resourcePriceFunctions/ethBlobsIndexer';
import celestiaIndexer from './resourcePriceFunctions/celestiaIndexer';
import { Deployment, MarketInfo } from './interfaces';

const safeRequire = async (path: string): Promise<Deployment | null> => {
  try {
    const module = await import(path);
    return module.default;
  } catch {
    return null;
  }
};

export const RESOURCES = [
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
    name: 'Ethereum Blobspace',
    slug: 'ethereum-blobspace',
    priceIndexer: new ethBlobsIndexer(),
  },
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
    markets.push(
      {
        deployment: yin,
        vaultAddress: yinVault.address,
        marketChainId: chainId,
        public: true,
        resource: RESOURCES[0], // Ethereum Gas
        isYin: true,
      },
      {
        deployment: yang,
        vaultAddress: yangVault.address,
        marketChainId: chainId,
        public: true,
        resource: RESOURCES[0], // Ethereum Gas
        isYin: false,
      }
    );
  }
};

const initializeMarkets = async () => {
  const FULL_MARKET_LIST: MarketInfo[] = [];

  // Mainnet Deployments
  await addMarketYinYang(FULL_MARKET_LIST, base.id);

  // Development Deployments
  if (process.env.NODE_ENV === 'development') {
    await addMarketYinYang(FULL_MARKET_LIST, cannon.id);
  }

  // Testnet Deployments
  if (
    process.env.NODE_ENV === 'staging' ||
    process.env.NODE_ENV === 'development'
  ) {
    await addMarketYinYang(FULL_MARKET_LIST, sepolia.id);
  }

  return FULL_MARKET_LIST;
};

export const MARKETS = await initializeMarkets();
