import { mainnet, sepolia, cannon } from "viem/chains";
import evmIndexer from "./resourcePriceFunctions/evmIndexer";
import celestiaIndexer from "./resourcePriceFunctions/celestiaIndexer";
import type { Deployment, MarketInfo } from "./interfaces";

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

const initializeMarkets = async () => {
  const FULL_MARKET_LIST = [
    /*
    {
      name: "Development Gas",
      deployment: await safeRequire(
        "@/protocol/deployments/13370/FoilYin.json"
      ),
      marketChainId: cannon.id,
      public: true,
      resource: RESOURCES[0], // Ethereum Gas
    },
    */
    {
      deployment: await safeRequire(
        "@/protocol/deployments/11155111/FoilYin.json",
      ),
      marketChainId: sepolia.id,
      public: true,
      resource: RESOURCES[0], // Ethereum Gas
    },
    {
      deployment: await safeRequire(
        "@/protocol/deployments/11155111/FoilYang.json",
      ),
      marketChainId: sepolia.id,
      public: true,
      resource: RESOURCES[0], // Ethereum Gas
    },
  ];

  return FULL_MARKET_LIST.filter(
    (market) => market.deployment !== null,
  ) as MarketInfo[];
};

export const MARKETS = await initializeMarkets();
