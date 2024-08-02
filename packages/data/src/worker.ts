import { Abi, createPublicClient, http, webSocket } from 'viem';
import { indexBaseFeePerGas } from './processes/chain';
import { indexMarketEvents } from './processes/market';
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
  indexBaseFeePerGas(mainnetPublicClient, `${sepolia.id}:${FoilSepolia.address}`), // consolidate this with above?
  indexMarketEvents(sepoliaPublicClient, FoilSepolia as {address: string, abi: Abi}),
  indexMarketEvents(cannonPublicClient, FoilLocal as {address: string, abi: Abi})
]).catch(error => {
  console.error('Error running processes in parallel:', error);
});
