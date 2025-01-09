import { mainnet, sepolia, cannon } from "viem/chains";
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
  },
  {
    name: "Celestia Blobspace",
    slug: "celestia-blobspace",
  },
];

const initializeMarkets = async () => {
  const FULL_MARKET_LIST = [
    /*
    {
      name: "Development Gas",
      deployment: await safeRequire(
        "@/protocol/deployments/13370/FoilYin.json"
      ),
      marketChainId: cannon.id,
      priceIndexer: new evmIndexer(mainnet.id),
      public: true,
      resource: RESOURCES[0], // Ethereum Gas
      deployMarket: true,
    },
    */
    {
      name: "Ethereum Gas",
      deployment: await safeRequire(
        "@/protocol/deployments/11155111/FoilYin.json"
      ),
      marketChainId: sepolia.id,
      priceIndexer: new evmIndexer(mainnet.id),
      public: true,
      resource: RESOURCES[0], // Ethereum Gas
      deployMarket: true,
    },
    {
      name: "Celestia Blobspace",
      deployment: await safeRequire(
        "@/protocol/deployments/23422/FoilYin.json"
      ),
      marketChainId: 23422,
      priceIndexer: new celestiaIndexer("https://api-mainnet.celenium.io"),
      public: true,
      resource: RESOURCES[1], // Celestia Blobspace
      deployMarket: false,
    },
  ];

  return FULL_MARKET_LIST.filter(
    (market) => !market.deployMarket || market.deployment !== null
  ) as MarketInfo[];
};

export const MARKETS = await initializeMarkets();
