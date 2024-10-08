import { ContractDeployment } from "./interfaces/interfaces";
import { sepolia, hardhat } from "viem/chains";
import { Abi } from "viem";
import { cannonPublicClient, sepoliaPublicClient } from "./util/reindexUtil";

let FoilLocal: ContractDeployment | undefined;
let FoilSepolia: ContractDeployment | undefined;

try {
  FoilLocal = require("@/protocol/deployments/13370/Foil.json");
} catch (error) {
  console.warn("FoilLocal not available");
}

try {
  FoilSepolia = require("@/protocol/deployments/11155111/Foil.json");
} catch (error) {
  console.warn("FoilSepolia not available");
}

export default [
  {
    name: "Development Gas Market",
    deployment: FoilLocal,
    chainId: hardhat.id,
    publicClient: cannonPublicClient,
    public: true,
  },
  {
    name: "Ethereum Gas Market",
    deployment: FoilSepolia,
    chainId: sepolia.id,
    publicClient: sepoliaPublicClient,
    public: true,
  },
  {
    name: "Sepolia Gas Market (v2)",
    deployment: {
      address: "0xfb17d7f02f4d29d900838f80605091e3778e38ee",
      abi: FoilSepolia?.abi || ({} as Abi),
    },
    chainId: sepolia.id,
    publicClient: sepoliaPublicClient,
    public: false,
  },
];