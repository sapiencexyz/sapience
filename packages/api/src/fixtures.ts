import { mainnet, sepolia, base, cannon, arbitrum } from 'viem/chains';
import evmIndexer from './resourcePriceFunctions/evmIndexer';
import ethBlobsIndexer from './resourcePriceFunctions/ethBlobsIndexer';
import celestiaIndexer from './resourcePriceFunctions/celestiaIndexer';
import btcIndexer from './resourcePriceFunctions/btcIndexer';
import { Deployment, MarketInfo } from './interfaces';
import { WeatherIndexer } from './resourcePriceFunctions/weatherIndexer';

export const TIME_INTERVALS = {
  intervals: {
    INTERVAL_1_MINUTE: 60,
    INTERVAL_5_MINUTES: 5 * 60,
    INTERVAL_15_MINUTES: 15 * 60,
    INTERVAL_30_MINUTES: 30 * 60,
    INTERVAL_4_HOURS: 4 * 60 * 60,
    INTERVAL_1_DAY: 24 * 60 * 60,
    INTERVAL_7_DAYS: 7 * 24 * 60 * 60,
    INTERVAL_28_DAYS: 28 * 24 * 60 * 60,
  },
};
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
    priceIndexer: new ethBlobsIndexer(mainnet.id),
  },
  {
    name: 'Bitcoin Fees',
    slug: 'bitcoin-fees',
    priceIndexer: new btcIndexer(),
    timeInterval: [],
  },
  {
    name: 'NYC Temperature',
    slug: 'nyc-temperature',
    priceIndexer: new WeatherIndexer('temperature'),
  },
  {
    name: 'LA Precipitation',
    slug: 'la-precipitation',
    priceIndexer: new WeatherIndexer('precipitation'),
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

const addMarketYinYang = async (
  markets: MarketInfo[],
  chainId: number,
  suffix?: string,
  resource = RESOURCES[0] // Default to Ethereum Gas
) => {
  const yin = await safeRequire(
    `@/protocol/deployments/${chainId}${suffix || ''}/FoilYin.json`
  );
  const yang = await safeRequire(
    `@/protocol/deployments/${chainId}${suffix || ''}/FoilYang.json`
  );
  const yinVault = await safeRequire(
    `@/protocol/deployments/${chainId}${suffix || ''}/VaultYin.json`
  );
  const yangVault = await safeRequire(
    `@/protocol/deployments/${chainId}${suffix || ''}/VaultYang.json`
  );

  if (yin && yang && yinVault && yangVault) {
    markets.push(
      {
        deployment: yin,
        vaultAddress: yinVault.address,
        marketChainId: chainId,
        resource,
        isYin: true,
      },
      {
        deployment: yang,
        vaultAddress: yangVault.address,
        marketChainId: chainId,
        resource,
        isYin: false,
      }
    );
  }
};

const initializeMarkets = async () => {
  const FULL_MARKET_LIST: MarketInfo[] = [];

  // Mainnet Deployments
  await addMarketYinYang(FULL_MARKET_LIST, base.id, '-beta'); // Remove after settling feb
  await addMarketYinYang(FULL_MARKET_LIST, base.id);
  await addMarketYinYang(FULL_MARKET_LIST, base.id, '-blobs', RESOURCES[3]); // Use Ethereum Blobspace for -blobs

  // // Development Deployments
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
