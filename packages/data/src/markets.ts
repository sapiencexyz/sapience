import { type Abi } from "viem";
import { mainnet, sepolia, cannon } from "viem/chains";
import evmIndexer from "./processes/evmIndexer";

interface Deployment {
  address: string;
  abi: Abi;
  deployTimestamp: string;
} 

const safeRequire = (path: string): Deployment | null => {
  try {
    return require(path);
  } catch {
    return null;
  }
};

export default [
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