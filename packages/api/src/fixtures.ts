import { mainnet, sepolia, base, cannon } from "viem/chains";
import evmIndexer from "./resourcePriceFunctions/evmIndexer";
import celestiaIndexer from "./resourcePriceFunctions/celestiaIndexer";
import { Deployment, MarketInfo } from "./interfaces";

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
    name: "Ethereum Gas",
    slug: "ethereum-gas",
    priceIndexer: new evmIndexer(mainnet.id),
  },
  {
    name: "Celestia Blobspace",
    slug: "celestia-blobspace",
    priceIndexer: new celestiaIndexer("https://api-mainnet.celenium.io"),
  },
];

const addMarketYinYang = async (
  markets: MarketInfo[],
  chainId: number
) => {
  const yin = await safeRequire(`@/protocol/deployments/${chainId}/FoilYin.json`);
  const yang = await safeRequire(`@/protocol/deployments/${chainId}/FoilYang.json`);
  
  if (yin && yang) {
    markets.push(
      {
        deployment: yin,
        marketChainId: chainId,
        public: true,
        resource: RESOURCES[0], // Ethereum Gas
      },
      {
        deployment: yang,
        marketChainId: chainId,
        public: true,
        resource: RESOURCES[0], // Ethereum Gas
      }
    );
  }
};

const initializeMarkets = async () => {
  const FULL_MARKET_LIST: MarketInfo[] = [];

  // Mainnet Deployments
  await addMarketYinYang(FULL_MARKET_LIST, base.id);

  // Development Deployments
  if (process.env.NODE_ENV === "development") {
    await addMarketYinYang(FULL_MARKET_LIST, cannon.id);
  }
  
  // Testnet Deployments
  if (process.env.NODE_ENV === "staging" || process.env.NODE_ENV === "development") {
    await addMarketYinYang(FULL_MARKET_LIST, sepolia.id);
  }

  return FULL_MARKET_LIST;
};

export const MARKETS = await initializeMarkets();
