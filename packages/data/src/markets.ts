import { mainnet, sepolia, cannon } from "viem/chains";
import evmIndexer from "./processes/evmIndexer";
import { Deployment, MarketInfo } from "./interfaces/interfaces";

const safeRequire = (path: string): Deployment | null => {
  try {
    return require(path);
  } catch {
    return null;
  }
};

const fullMarketList = [
  {
    name: "Development Gas Market",
    deployment: safeRequire("@/protocol/deployments/13370/Foil.json"),
    marketChainId: cannon.id,
    priceIndexer: new evmIndexer(mainnet.id),
    public: true,
  },
  {
    name: "Ethereum Gas Market",
    deployment: safeRequire("@/protocol/deployments/11155111/Foil.json"),
    marketChainId: sepolia.id,
    priceIndexer: new evmIndexer(mainnet.id),
    public: true,
  },
];

export default fullMarketList.filter((market) => market.deployment !== null) as MarketInfo[];