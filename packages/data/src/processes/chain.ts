import 'tsconfig-paths/register';
import { createConnection } from 'typeorm';
import { Price } from '../entity/Price';
import { Block, PublicClient } from 'viem';
import connectionOptions from '../db';

export const indexBaseFeePerGas = async (publicClient: PublicClient, contractId: string) => {
  const connection = await createConnection(connectionOptions);
  const priceRepository = connection.getRepository(Price);
  const chainId = await publicClient.getChainId();

  // Process log data
  const processBlock = async (block: Block) => {
    const value = Number(block.baseFeePerGas);
    const timestamp = Number(block.timestamp);

    let price = await priceRepository.findOne({ where: { contractId, timestamp } });

    if (price) {
      // Update existing record
      price.value = value;
      console.log('Updating price:', price);
    } else {
      // Create new record
      price = priceRepository.create({
        contractId,
        timestamp,
        value,
      });
      console.log('Creating price:', price);
    }

    await priceRepository.save(price);
  };

  // Start watching for new events
  console.log(`Watching base fee per gas on chain ID ${chainId} for market ${contractId}`);
  publicClient.watchBlocks({
    onBlock: (block) => processBlock(block),
    onError: (error) => console.error(error),
  });
};

export const indexBaseFeePerGasRange = async (publicClient: PublicClient, start: number, end: number, contractId: string) => {
  const connection = await createConnection(connectionOptions);
  const priceRepository = connection.getRepository(Price);

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    try {
      const block = await publicClient.getBlock({ blockNumber: BigInt(blockNumber) });
      const value = Number(block.baseFeePerGas);
      const timestamp = Number(block.timestamp);

      let price = await priceRepository.findOne({ where: { contractId, block: blockNumber } });

      if (price) {
        // Update existing record
        price.value = value;
        console.log('Updating price:', price);
      } else {
        // Create new record
        price = priceRepository.create({
          contractId,
          timestamp,
          value,
          block: blockNumber
        });
        console.log('Creating price:', price);
      }

      await priceRepository.save(price);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};
