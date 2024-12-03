import "reflect-metadata";
import { initializeDataSource } from "./db";
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

  if (model === 'ResourcePrice') {
    const block = await getProviderForChain(chainId).getBlock({ blockNumber: BigInt(startBlockNumber) });
      if (!block.timestamp) throw new Error("Could not get block timestamp");

    await marketInfo.priceIndexer.indexBlockPriceFromTimestamp(
      market,
      Number(block.timestamp),
      startBlockNumber,
      true
    );
  } else {
    await Promise.all([
      reindexMarketEvents(market, marketInfo.deployment.abi, true),
      reindexCollateralEvents(market, true),
    ]);
  }

  console.log(`Finished reindexing ${model}s for market ${address} on chain ${chainId}`);
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
