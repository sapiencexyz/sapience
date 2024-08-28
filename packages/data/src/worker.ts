import dataSource, { initializeDataSource } from "./db";
import { Abi, Chain, createPublicClient, http, webSocket } from "viem";
import * as chains from "viem/chains";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import { indexMarketEvents, indexMarketEventsRange } from "./processes/market"; // Assuming you have this function
import { mainnet, sepolia, hardhat } from "viem/chains";
import FoilLocal from "@/protocol/deployments/13370/Foil.json";
import FoilSepolia from "@/protocol/deployments/11155111/Foil.json";
import { Market } from "./entity/Market";

const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://sepolia.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

hardhat.id = 13370 as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http("http://localhost:8545"),
});

function findChainById(chainId: number): Chain | undefined {
  const availableChains = Object.values(chains);
  return availableChains.find((chain) => chain.id === chainId);
}

async function createViemPublicClient(providerUrl: string) {
  const transport = http(providerUrl);

  // Create a temporary client to get the chain ID
  const tempClient = createPublicClient({
    chain: mainnet, // Temporary chain, will be overridden
    transport,
  });

  // Call the eth_chainId method to get the chain ID
  const chainIdHex = await tempClient.request({ method: "eth_chainId" });
  const chainId = parseInt(chainIdHex, 16);

  // Find the corresponding chain configuration
  const chain = findChainById(chainId);

  if (!chain) {
    throw new Error(`Unsupported or unknown chain ID: ${chainId}`);
  }

  // Create the final client with the correct chain
  const client = createPublicClient({
    chain,
    transport,
  });

  return client;
}

async function indexBaseFeePerGasRangeCommand(
  startBlock: number,
  endBlock: number,
  rpcUrl: string,
  contractAddress: string
) {
  console.log(
    `Indexing base fee per gas from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`
  );
  const client = await createViemPublicClient(rpcUrl);
  const [chainId, address] = contractAddress.split(":");
  await indexBaseFeePerGasRange(client, startBlock, endBlock, parseInt(chainId), address);
}

async function indexMarketEventsRangeCommand(
  startBlock: number,
  endBlock: number,
  rpcUrl: string,
  contractAddress: string,
  contractAbi: Abi
) {
  console.log(
    `Indexing market events from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`
  );
  const client = await createViemPublicClient(rpcUrl);
  await indexMarketEventsRange(
    client,
    startBlock,
    endBlock,
    contractAddress,
    contractAbi
  );
}

async function initializeMarkets(){
  await initializeDataSource();
  const marketRepository = dataSource.getRepository(Market);
  
  const marketLocal = marketRepository.create({ address: FoilLocal.address, chainId: 13370 });
  await marketRepository.save(marketLocal);

  const marketSepolia = marketRepository.create({ address: FoilSepolia.address, chainId: 11155111 });
  await marketRepository.save(marketSepolia);
}

if (process.argv.length < 3) {
  initializeMarkets().then(() => {
    Promise.all([
      indexBaseFeePerGas(
        mainnetPublicClient,
        hardhat.id,
        FoilLocal.address
      ),
      indexBaseFeePerGas(
        mainnetPublicClient,
        sepolia.id,
        FoilSepolia.address
      ),
      indexMarketEvents(
        sepoliaPublicClient,
        FoilSepolia as { address: string; abi: Abi }
      ),
      indexMarketEvents(
        cannonPublicClient,
        FoilLocal as { address: string; abi: Abi }
      ),
    ]).catch((error) => {
      console.error("Error running processes in parallel:", error);
    });
  });
} else {
  const args = process.argv.slice(2);
  if (args[0] === "index-sepolia") {
    Promise.all([
      indexBaseFeePerGasRangeCommand(
        20413376,
        20428947,
        "https://ethereum-rpc.publicnode.com",
        `${sepolia.id}:${FoilSepolia.address}`
      ),
      indexMarketEventsRangeCommand(
        6506300,
        6606300,
        "https://ethereum-sepolia-rpc.publicnode.com",
        FoilSepolia.address,
        FoilSepolia.abi as Abi
      ),
    ]);
  }
}
