import { Abi, createPublicClient, http, webSocket } from 'viem';
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from './processes/chain';
import { indexMarketEvents, indexMarketEventsRange } from './processes/market'; // Assuming you have this function
import { mainnet, sepolia, hardhat } from 'viem/chains';
import FoilLocal from '@/protocol/deployments/13370/Foil.json';
import FoilSepolia from '@/protocol/deployments/11155111/Foil.json';

const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket()
});

const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: webSocket()
});

hardhat.id = 13370 as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http()
});

Promise.all([
  indexBaseFeePerGas(mainnetPublicClient, `${hardhat.id}:${FoilLocal.address}`),
  indexBaseFeePerGas(mainnetPublicClient, `${sepolia.id}:${FoilSepolia.address}`),
  indexMarketEvents(sepoliaPublicClient, FoilSepolia as { address: string, abi: Abi }),
  indexMarketEvents(cannonPublicClient, FoilLocal as { address: string, abi: Abi })
]).catch(error => {
  console.error('Error running processes in parallel:', error);
});

// Function to create PublicClient based on rpc-url
function createClientFromRpcUrl(rpcUrl: string): any {
  const isWebSocket = rpcUrl.startsWith('ws');
  return createPublicClient({
    chain: { id: 0, rpcUrls: [rpcUrl] },
    transport: isWebSocket ? webSocket() : http()
  });
}

// Function to index base fee per gas range
async function indexBaseFeePerGasRange(startBlock: number, endBlock: number, rpcUrl: string, contractAddress: string) {
  console.log(`Indexing base fee per gas from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`);
  const client = createClientFromRpcUrl(rpcUrl);
  await indexBaseFeePerGasRange(client, startBlock, endBlock, contractAddress);
}

// Function to index market events range
async function indexMarketEventsRange(startBlock: number, endBlock: number, rpcUrl: string, contractAddress: string, contractAbi: Abi) {
  console.log(`Indexing market events from block ${startBlock} to ${endBlock} for contract ${contractAddress} using ${rpcUrl}`);
  const client = createClientFromRpcUrl(rpcUrl);
  await indexMarketEventsRange(client, startBlock, endBlock, contractAddress, contractAbi);
}

// Command-line argument handling
const args = process.argv.slice(2);
if (args[0] === 'index-base-fee-per-gas') {
  const [start, end, rpcUrl, contractAddress] = args.slice(1);
  indexBaseFeePerGasRange(Number(start), Number(end), rpcUrl, contractAddress)
    .then(() => console.log('Indexing completed successfully'))
    .catch(error => console.error('Error indexing base fee per gas range:', error));
} else if (args[0] === 'index-market-events') {
  const [start, end, rpcUrl, contractAddress, contractAbiPath] = args.slice(1);
  const contractAbi = require(contractAbiPath) as Abi; // Assuming the ABI is provided as a JSON file path
  indexMarketEventsRange(Number(start), Number(end), rpcUrl, contractAddress, contractAbi)
    .then(() => console.log('Indexing completed successfully'))
    .catch(error => console.error('Error indexing market events range:', error));
}
