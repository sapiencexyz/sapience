import "reflect-metadata";
import { initializeDataSource, resourcePriceRepository } from "./db";
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
import { getMarketStartEndBlock } from "./controllers/marketHelpers";
import { Between } from "typeorm";

const MAX_RETRIES = Infinity;
const RETRY_DELAY = 5000; // 5 seconds

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(
  operation: () => Promise<T>,
  name: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt}/${maxRetries} failed for ${name}:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Retrying ${name} in ${RETRY_DELAY/1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  
  throw new Error(`All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`);
}

function createResilientProcess<T>(
  process: () => Promise<T>,
  name: string
): () => Promise<T | void> {
  return async () => {
    while (true) {
      try {
        return await withRetry(process, name);
      } catch (error) {
        console.error(`Process ${name} failed after all retries. Restarting...`, error);
        await delay(RETRY_DELAY);
      }
    }
  };
}

async function main() {
  await initializeDataSource();
  const jobs: Promise<void>[] = [];
  console.log("starting worker");

  for (const marketInfo of MARKET_INFO) {
    const market = await initializeMarket(marketInfo);
    console.log(
      "initialized market",
      market.address,
      "on chain",
      market.chainId
    );
    
    await createOrUpdateEpochFromContract(marketInfo, market);

    jobs.push(
      createResilientProcess(
        () => indexMarketEvents(market, marketInfo.deployment.abi),
        `indexMarketEvents-${market.address}`
      )()
    );
    
    jobs.push(
      createResilientProcess(
        () => marketInfo.priceIndexer.watchBlocksForMarket(market),
        `watchBlocksForMarket-${market.address}`
      )()
    );
    
    jobs.push(
      createResilientProcess(
        () => indexCollateralEvents(market),
        `indexCollateralEvents-${market.address}`
      )()
    );
  }

  await Promise.all(jobs);
}

export async function reindexMarket(
  chainId: number,
  address: string,
  epochId: string
) {
  console.log("reindexing market", address, "on chain", chainId, "epoch", epochId);

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
    reindexMarketEvents(market, marketInfo.deployment.abi, Number(epochId)),
    reindexCollateralEvents(market, Number(epochId)),
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

  if (model === 'ResourcePrice') {
    // Get block numbers using the price indexer client
    const { startBlockNumber, endBlockNumber, error } = await getMarketStartEndBlock(
      market,
      epochId,
      marketInfo.priceIndexer.client
    );
    
    if (error || !startBlockNumber || !endBlockNumber) {
      return { missingBlockNumbers: null, error };
    }

    // Get existing block numbers for ResourcePrice
    const resourcePrices = await resourcePriceRepository.find({
      where: {
        market: { id: market.id },
        blockNumber: Between(startBlockNumber, endBlockNumber),
      },
      select: ["blockNumber"],
    });

    const existingBlockNumbersSet = new Set(
      resourcePrices.map((ip) => Number(ip.blockNumber))
    );

    // Find missing block numbers within the range
    const missingBlockNumbers = [];
    for (let blockNumber = startBlockNumber; blockNumber <= endBlockNumber; blockNumber++) {
      if (!existingBlockNumbersSet.has(blockNumber)) {
        missingBlockNumbers.push(blockNumber);
      }
    }

    await marketInfo.priceIndexer.indexBlocks(
      market,
      missingBlockNumbers
    );
  } else {
    await Promise.all([
      reindexMarketEvents(market, marketInfo.deployment.abi, Number(epochId)),
      reindexCollateralEvents(market, Number(epochId)),
    ]);
  }

  console.log(`Finished reindexing ${model}s for market ${address} on chain ${chainId}`);
}

if (process.argv[2] === "reindexMarket") {
  const callReindex = async () => {
    const chainId = parseInt(process.argv[3], 10);
    const address = process.argv[4];
    const epochId = process.argv[5];

    if (isNaN(chainId) || !address) {
      console.error(
        "Invalid arguments. Usage: tsx src/worker.ts reindexMarket <chainId> <address> <epochId>"
      );
      process.exit(1);
    }
    await reindexMarket(chainId, address, epochId);
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
        "Invalid arguments. Usage: tsx src/worker.ts reindexMissing <chainId> <address> <epochId> <ResourcePrice|Event>"
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
