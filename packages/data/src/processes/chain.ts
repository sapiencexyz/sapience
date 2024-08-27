import "tsconfig-paths/register";
import dataSource, { initializeDataSource } from "src/db";
import { Price } from "../entity/Price";
import { Block, PublicClient } from "viem";

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

    const price = new Price();
    price.contractId = contractId;
    price.timestamp = timestamp;
    price.value = value;
    if (block.number) {
      price.blockNumber = block.number.toString();
    }
    await priceRepository.upsert(price, ["contractId", "timestamp"]);
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

      const price = new Price();
      price.contractId = contractId;
      price.timestamp = timestamp;
      price.value = value;
      price.blockNumber = blockNumber.toString();
      await priceRepository.upsert(price, ["contractId", "timestamp"]);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};
