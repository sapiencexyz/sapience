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
    name: 'Ethereum Gas',
  },
  {
    name: 'Celestia Blobspace',
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
    },
  ];

  return FULL_MARKET_LIST.filter(
    (market) => market.deployment !== null
  ) as MarketInfo[];
};

export const MARKETS = await initializeMarkets();
