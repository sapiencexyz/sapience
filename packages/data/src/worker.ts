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
import * as Sentry from "@sentry/node";

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
      
      // Report error to Sentry with context
      Sentry.withScope((scope) => {
        scope.setExtra("attempt", attempt);
        scope.setExtra("maxRetries", maxRetries);
        scope.setExtra("operationName", name);
        Sentry.captureException(error);
      });
      
      if (attempt < maxRetries) {
        console.log(`Retrying ${name} in ${RETRY_DELAY/1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  
  const finalError = new Error(`All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`);
  Sentry.captureException(finalError);
  throw finalError;
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
  try {
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
  } catch (error) {
    console.error("Error in reindexMarket:", error);
    Sentry.withScope((scope) => {
      scope.setExtra("chainId", chainId);
      scope.setExtra("address", address);
      scope.setExtra("epochId", epochId);
      Sentry.captureException(error);
    });
    throw error;
  }
}

export async function reindexMissingBlocks(
  chainId: number,
  address: string,
  epochId: string,
) {
  try {
    console.log(`Starting reindex of missing resource blocks for market ${chainId}:${address}, epoch ${epochId}`);
    
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

    const { startBlockNumber, endBlockNumber, error } = await getMarketStartEndBlock(
      market,
      epochId,
      marketInfo.priceIndexer.client
    );
    
    if (error || !startBlockNumber || !endBlockNumber) {
      return { missingBlockNumbers: null, error };
    }

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

    console.log(`Finished reindexing resource blocks for market ${address} on chain ${chainId}`);
  } catch (error) {
    console.error(`Error in reindexMissingBlocks:`, error);
    Sentry.withScope((scope) => {
      scope.setExtra("chainId", chainId);
      scope.setExtra("address", address);
      scope.setExtra("epochId", epochId);
      Sentry.captureException(error);
    });
    throw error;
  }
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
    await reindexMissingBlocks(chainId, address, epochId);
    console.log("DONE");
    process.exit(0);
  };
  callReindexMissing();
} else {
  main();
}
