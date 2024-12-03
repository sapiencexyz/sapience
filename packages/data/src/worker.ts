import "reflect-metadata";
import { eventRepository, initializeDataSource, resourcePriceRepository } from "./db";
import {
  indexMarketEvents,
  initializeMarket,
  reindexMarketEvents,
} from "./controllers/market";
import { MARKET_INFO } from "./markets";
import { createOrUpdateEpochFromContract } from "./controllers/marketHelpers";
import {
  indexCollateralEvents,
  reindexCollateralEvents,
} from "./controllers/collateral";
import { Between } from "typeorm";
import { ResourcePrice } from "./models/ResourcePrice";
import { Event } from "./models/Event";
import { getMarketStartEndBlock } from "./controllers/marketHelpers";
import { getProviderForChain } from "./helpers";

async function main() {
  await initializeDataSource();
  let jobs = [];
  console.log("starting worker");

  for (const marketInfo of MARKET_INFO) {
    const market = await initializeMarket(marketInfo);
    console.log(
      "initialized market",
      market.address,
      "on chain",
      market.chainId
    );
    // initialize epoch
    await createOrUpdateEpochFromContract(marketInfo, market);
    jobs.push(indexMarketEvents(market, marketInfo.deployment.abi));
    jobs.push(marketInfo.priceIndexer.watchBlocksForMarket(market));
    jobs.push(indexCollateralEvents(market));
  }

  await Promise.all(jobs);
}

export async function reindexMarket(
  chainId: number,
  address: string,
  initialTimestamp?: number
) {
  console.log("reindexing market", address, "on chain", chainId);

  await initializeDataSource();
  const marketInfo = MARKET_INFO.find(
    (m) =>
      m.marketChainId === chainId &&
      m.deployment.address.toLowerCase() === address.toLowerCase()
  );
  if (!marketInfo) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}`
    );
  }
  const market = await initializeMarket(marketInfo);

  await Promise.all([
    reindexMarketEvents(market, marketInfo.deployment.abi),
    reindexCollateralEvents(market),
    marketInfo.priceIndexer.indexBlockPriceFromTimestamp(
      market,
      initialTimestamp || market.deployTimestamp || 0
    ),
  ]);
  console.log("finished reindexing market", address, "on chain", chainId);
}

export async function reindexMissingBlocks(
  chainId: number,
  address: string,
  epochId: string,
  model: 'ResourcePrice' | 'Event'
) {
  console.log(`Starting reindex of missing ${model}s for market ${chainId}:${address}, epoch ${epochId}`);
  
  await initializeDataSource();
  const marketInfo = MARKET_INFO.find(
    (m) =>
      m.marketChainId === chainId &&
      m.deployment.address.toLowerCase() === address.toLowerCase()
  );
  if (!marketInfo) {
    throw new Error(`Market not found for chainId ${chainId} and address ${address}`);
  }
  const market = await initializeMarket(marketInfo);

  // Get block range
  const { startBlockNumber, endBlockNumber, error } = await getMarketStartEndBlock(market, epochId);
  if (error || !startBlockNumber || !endBlockNumber) {
    throw new Error(`Failed to get block range: ${error}`);
  }

  // Get missing blocks
  const repository = model === 'ResourcePrice' ? resourcePriceRepository : eventRepository;
  const existingEntries = await repository.find({
    where: {
      market: { id: market.id },
      blockNumber: Between(startBlockNumber, endBlockNumber),
    },
    select: ['blockNumber'],
  });
  const existingBlockNumbersSet = new Set(existingEntries.map(entry => Number(entry.blockNumber)));

  const missingBlockNumbers = [];
  for (let blockNumber = startBlockNumber; blockNumber <= endBlockNumber; blockNumber++) {
    if (!existingBlockNumbersSet.has(blockNumber)) {
      missingBlockNumbers.push(blockNumber);
    }
  }

  if (missingBlockNumbers.length === 0) {
    console.log('No missing blocks found');
    return;
  }

  console.log(`Found ${missingBlockNumbers.length} missing blocks`);

  // Reindex missing blocks
  const client = getProviderForChain(Number(chainId));
  const indexingErrors = [];

  for (const blockNumber of missingBlockNumbers) {
    try {
      if (model === 'ResourcePrice') {
        const block = await client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        
        if (block.baseFeePerGas) {
          const resourcePrice = new ResourcePrice();
          resourcePrice.market = market;
          resourcePrice.timestamp = Number(block.timestamp);
          resourcePrice.value = block.baseFeePerGas.toString();
          resourcePrice.used = block.gasUsed.toString();
          resourcePrice.blockNumber = blockNumber;
          await resourcePriceRepository.save(resourcePrice);
          console.log(`Indexed resource price for block ${blockNumber}`);
        }
      } else {
        const logs = await client.getLogs({
          address: address as `0x${string}`,
          fromBlock: BigInt(blockNumber),
          toBlock: BigInt(blockNumber),
        });

        for (const log of logs) {
          const block = await client.getBlock({
            blockNumber: log.blockNumber,
          });

          const event = new Event();
          event.market = market;
          event.blockNumber = Number(log.blockNumber);
          event.logIndex = (log.logIndex || 0).toString();
          event.timestamp = Number(block.timestamp);
          event.transactionHash = log.transactionHash || '';
          event.logData = log;
          await eventRepository.save(event);
          console.log(`Indexed event for block ${blockNumber}`);
        }
      }
    } catch (e) {
      console.error(`Error reindexing block ${blockNumber}:`, e);
      indexingErrors.push(`Block ${blockNumber}: ${e.message}`);
    }
  }

  if (indexingErrors.length > 0) {
    console.error('Indexing completed with errors:', indexingErrors);
  } else {
    console.log('Indexing completed successfully');
  }
}

if (process.argv[2] === "reindexMarket") {
  const callReindex = async () => {
    const chainId = parseInt(process.argv[3], 10);
    const address = process.argv[4];
    const initialTimestamp = parseInt(process.argv[5], 10);

    if (isNaN(chainId) || !address) {
      console.error(
        "Invalid arguments. Usage: ts-node src/worker.ts reindexMarket <chainId> <address>"
      );
      process.exit(1);
    }
    await reindexMarket(chainId, address, initialTimestamp);
    console.log("DONE");
    process.exit(0);
  };
  callReindex();
} else if (process.argv[2] === "reindexMissing") {
  const callReindexMissing = async () => {
    const chainId = parseInt(process.argv[3], 10);
    const address = process.argv[4];
    const epochId = process.argv[5];
    const model = process.argv[6] as 'ResourcePrice' | 'Event';

    if (isNaN(chainId) || !address || !epochId || !['ResourcePrice', 'Event'].includes(model)) {
      console.error(
        "Invalid arguments. Usage: ts-node src/worker.ts reindexMissing <chainId> <address> <epochId> <ResourcePrice|Event>"
      );
      process.exit(1);
    }
    await reindexMissingBlocks(chainId, address, epochId, model);
    console.log("DONE");
    process.exit(0);
  };
  callReindexMissing();
} else {
  main();
}
