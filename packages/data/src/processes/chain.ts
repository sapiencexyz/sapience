import "tsconfig-paths/register";
import { Price } from "../entity/Price";
import { Block, PublicClient } from "viem";
import dataSource, { initializeDataSource } from "../db";

export const indexBaseFeePerGas = async (
  publicClient: PublicClient,
  contractId: string
) => {
  await initializeDataSource();
  const priceRepository = dataSource.getRepository(Price);
  const chainId = await publicClient.getChainId();

  // Process log data
  const processBlock = async (block: Block) => {
    const value = block.baseFeePerGas?.toString() || "0";
    const timestamp = block.timestamp.toString();

    let price = await priceRepository.findOne({
      where: { contractId, timestamp },
    });

    if (price) {
      // Update existing record
      price.value = value;
      console.log("Updating price:", price);
    } else {
      // Create new record
      price = priceRepository.create({
        contractId,
        timestamp,
        value,
      });
      console.log("Creating price:", price);
    }

    await priceRepository.save(price);
  };

  // Start watching for new events
  console.log(
    `Watching base fee per gas on chain ID ${chainId} for market ${contractId}`
  );
  publicClient.watchBlocks({
    onBlock: (block) => processBlock(block),
    onError: (error) => console.error(error),
  });
};

export const indexBaseFeePerGasRange = async (
  publicClient: PublicClient,
  start: number,
  end: number,
  contractId: string
) => {
  await initializeDataSource();
  const priceRepository = dataSource.getRepository(Price);

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    try {
      const block = await publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
      });
      const value = block.baseFeePerGas?.toString() || "0";
      const timestamp = block.timestamp.toString();

      let price = await priceRepository.findOne({
        where: { contractId, blockNumber: blockNumber.toString() },
      });

      if (price) {
        // Update existing record
        price.value = value;
        console.log("Updating price:", price);
      } else {
        // Create new record
        price = priceRepository.create({
          contractId,
          timestamp,
          value,
          blockNumber: blockNumber.toString(),
        });
        console.log("Creating price:", price);
      }

      await priceRepository.save(price);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};
