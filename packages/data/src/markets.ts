import { mainnet, sepolia, cannon } from "viem/chains";
import evmIndexer from "./resourcePriceFunctions/evmIndexer";
import { Deployment, MarketInfo } from "./interfaces";

const safeRequire = async (path: string): Promise<Deployment | null> => {
  try {
    const module = await import(path);
    return module.default;
  } catch {
    return null;
  }
};

const initializeMarkets = async () => {
  const FULL_MARKET_LIST = [
    {
      name: "Development Gas",
      deployment: await safeRequire("@/protocol/deployments/13370/Foil1.json"),
      marketChainId: cannon.id,
      priceIndexer: new evmIndexer(mainnet.id),
      public: true,
    },
    {
      name: "Ethereum Gas",
      deployment: await safeRequire("@/protocol/deployments/11155111/Foil1.json"),
      marketChainId: sepolia.id,
      priceIndexer: new evmIndexer(mainnet.id),
      public: true,
    },
  ];

  return FULL_MARKET_LIST.filter(
    (market) => market.deployment !== null
  ) as MarketInfo[];
};

export const MARKET_INFO = await initializeMarkets();
