import { mainnet, sepolia, cannon } from "viem/chains";
import evmIndexer from "./resourcePriceFunctions/evmIndexer";
import { Deployment, MarketInfo } from "./interfaces";

export const NUMERIC_PRECISION = 78;
export const TOKEN_PRECISION = 18;
export const DECIMAL_SCALE = 15;

export const FEE = 0.0001;

export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const safeRequire = (path: string): Deployment | null => {
  try {
    return require(path);
  } catch {
    return null;
  }
};

const FULL_MARKET_LIST = [
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
  }
];

export const MARKET_INFO = FULL_MARKET_LIST.filter((market) => market.deployment !== null) as MarketInfo[];