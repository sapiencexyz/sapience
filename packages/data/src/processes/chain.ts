import "tsconfig-paths/register";
import { Price } from "../entity/Price";
import { Block, PublicClient } from "viem";
import dataSource, { initializeDataSource } from "../db";
import { Market } from "src/entity/Market";

export const indexBaseFeePerGas = async (
  publicClient: PublicClient,
  chainId: number,
  address: string
) => {
  await initializeDataSource();
  const priceRepository = dataSource.getRepository(Price);
  const marketRepository = dataSource.getRepository(Market);

  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId != chainId) {
    throw new Error(`Chain ID from RPC ${rpcChainId} doesn't match chain ID ${chainId}`);
  }

  const market = await marketRepository.findOne({ where: { chainId, address } });
  if (!market) {
    throw new Error(`Market not found for chainId ${chainId} and address ${address}`);
  }

  // Process log data
  const processBlock = async (block: Block) => {
    const value = block.baseFeePerGas?.toString() || "0";
    const timestamp = block.timestamp.toString();

    const price = new Price();
    price.market = market;
    price.timestamp = timestamp;
    price.value = value;
    if (block.number) {
      price.blockNumber = block.number.toString();
    }
    await priceRepository.upsert(price, ["contractId", "timestamp"]);
  };

  // Start watching for new events
  console.log(
    `Watching base fee per gas on chain ID ${chainId} for market ${chainId}:${address}`
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
  chainId: number,
  address: string
) => {
  await initializeDataSource();
  const priceRepository = dataSource.getRepository(Price);
  const marketRepository = dataSource.getRepository(Market);

  const market = await marketRepository.findOne({ where: { chainId, address } });
  if (!market) {
    throw new Error(`Market not found for chainId ${chainId} and address ${address}`);
  }

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    try {
      const block = await publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
      });
      const value = block.baseFeePerGas?.toString() || "0";
      const timestamp = block.timestamp.toString();

      const price = new Price();
      price.market = market;
      price.timestamp = timestamp;
      price.value = value;
      price.blockNumber = blockNumber.toString();

      await priceRepository.upsert(price, ["market", "timestamp"]);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};