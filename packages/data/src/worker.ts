import { Abi, createPublicClient, http } from 'viem';
import { indexBaseFeePerGas } from './processes/chain';
import { indexMarketEvents } from './processes/market';
import { mainnet, hardhat } from 'viem/chains';
import Foil from '@/protocol/deployments/13370/Foil.json';

const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: http(), // switch to websockets? should automatically switch poll default on watchContractEvent 
});

hardhat.id = 13370 as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http() // switch to websockets? should automatically switch poll default on watchContractEvent 
});

Promise.all([
  indexBaseFeePerGas(mainnetPublicClient, `${hardhat.id}:${Foil.address}`),
  indexMarketEvents(cannonPublicClient, Foil as {address: string, abi: Abi}) // unsure why this type assertion is necessary
]).catch(error => {
  console.error('Error running processes in parallel:', error);
});
