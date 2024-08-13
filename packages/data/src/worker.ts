import { Abi, Chain, createPublicClient, http, webSocket } from 'viem';
import * as chains from 'viem/chains';
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from './processes/chain';
import { indexMarketEvents, indexMarketEventsRange } from './processes/market'; // Assuming you have this function
import { mainnet, sepolia, hardhat } from 'viem/chains';
import FoilLocal from '@/protocol/deployments/13370/Foil.json';
import FoilSepolia from '@/protocol/deployments/11155111/Foil.json';

const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: http() // switch to websockets with a paid endpoint
});

const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: http() // switch to websockets with a paid endpoint
});

hardhat.id = 13370 as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http("http://localhost:8545")
});

function findChainById(chainId: number): Chain | undefined {
  const availableChains = Object.values(chains);
  return availableChains.find(chain => chain.id === chainId);
}

async function createViemPublicClient(providerUrl: string) {
  const transport = http(providerUrl);

  // Create a temporary client to get the chain ID
  const tempClient = createPublicClient({
      chain: mainnet,  // Temporary chain, will be overridden
      transport,
  });

  // Call the eth_chainId method to get the chain ID
  const chainIdHex = await tempClient.request({ method: 'eth_chainId' });
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

async function indexBaseFeePerGasRangeCommand(startBlock: number, endBlock: number, rpcUrl: string, contractAddress: string) {
console.log(`Indexing base fee per gas from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`);
const client = await createViemPublicClient(rpcUrl);
await indexBaseFeePerGasRange(client, startBlock, endBlock, contractAddress);
}

async function indexMarketEventsRangeCommand(startBlock: number, endBlock: number, rpcUrl: string, contractAddress: string, contractAbi: Abi) {
console.log(`Indexing market events from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`);
const client = await createViemPublicClient(rpcUrl);
await indexMarketEventsRange(client, startBlock, endBlock, contractAddress, contractAbi);
}

if(process.argv.length < 3) {
  Promise.all([
    indexBaseFeePerGas(mainnetPublicClient, `${hardhat.id}:${FoilLocal.address}`),
    indexBaseFeePerGas(mainnetPublicClient, `${sepolia.id}:${FoilSepolia.address}`),
    indexMarketEvents(sepoliaPublicClient, FoilSepolia as { address: string, abi: Abi }),
    indexMarketEvents(cannonPublicClient, FoilLocal as { address: string, abi: Abi })
  ]).catch(error => {
    console.error('Error running processes in parallel:', error);
  });
} else {
const args = process.argv.slice(2);
if (args[0] === 'index-sepolia') {
  // Index mainnet gas to sepolia contract
  indexBaseFeePerGasRangeCommand(20413376, 20428947, 'https://ethereum-rpc.publicnode.com', `${sepolia.id}:${FoilSepolia.address}`)
  //indexMarketEventsRangeCommand(1722270000, 1722458027, 'https://ethereum-rpc.publicnode.com', FoilSepolia.address, FoilSepolia.abi as Abi)
} else if (args[0] === 'index-base-fee-per-gas') {
  const [start, end, rpcUrl, contractAddress] = args.slice(1);
  indexBaseFeePerGasRangeCommand(Number(start), Number(end), rpcUrl, contractAddress)
    .then(() => console.log('Indexing completed successfully'))
    .catch(error => console.error('Error indexing base fee per gas range:', error));
} else if (args[0] === 'index-market-events') {
  const [start, end, rpcUrl, contractAddress, contractAbiPath] = args.slice(1);
  const contractAbi = require(contractAbiPath) as Abi; // Assuming the ABI is provided as a JSON file path
  indexMarketEventsRangeCommand(Number(start), Number(end), rpcUrl, contractAddress, contractAbi)
    .then(() => console.log('Indexing completed successfully'))
    .catch(error => console.error('Error indexing market events range:', error));
}

}