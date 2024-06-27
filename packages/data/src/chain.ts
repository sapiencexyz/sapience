import { createConnection } from 'typeorm';
import { Price } from './entity/Price';
import { createPublicClient, http, Block } from 'viem';
import Foil from '../deployments/Foil.json';
import { mainnet, hardhat } from 'viem/chains';

// Initialize RPC connection
export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(), // switch to websockets? should automatically switch poll default on watchContractEvent 
});

const startBackgroundProcess = async () => {
  // Initialize database connection
  const connection = await createConnection({
    type: 'sqlite',
    database: './data/database.sqlite',
    synchronize: true,
    logging: true,
    entities: [Price],
  });
  const priceRepository = connection.getRepository(Price);

  // Process log data
  const processBlock = async (block: Block) => {
    // Ensure block.baseFeePerGas is a number, adjust if necessary
    const value = Number(block.baseFeePerGas);

    const price = priceRepository.create({
      contractId: `${hardhat.id}:${Foil.address}`,
      timestamp: Number(block.timestamp),
      value: value,
    });

    console.log('Creating price:', price);
    await priceRepository.save(price);
  };

  // Start watching for new events
  console.log(`Watching contract events for ${Foil.address}`);
  const unwatch = publicClient.watchBlocks({
    onBlock: (block) => processBlock(block),
    onError: (block) => console.error(block),
  });
};

startBackgroundProcess().catch((error) => console.log(error));
