import "reflect-metadata";
import { initializeDataSource, resourcePriceRepository } from "./db";
import {
  indexMarketEvents,
  initializeMarket,
  reindexMarketEvents,
} from "./controllers/market";
import { MARKET_INFO } from "./markets";
import { createOrUpdateEpochFromContract } from "./controllers/marketHelpers";
// import {
//   indexCollateralEvents,
//   reindexCollateralEvents,
// } from "./controllers/collateral";
import { getMarketStartEndBlock } from "./controllers/marketHelpers";
import { Between } from "typeorm";

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
    // jobs.push(indexCollateralEvents(market));
  }

  await Promise.all(jobs);
}

export async function reindexMarket(
  chainId: number,
  address: string,
  epochId: string
) {
  console.log(
    "reindexing market",
    address,
    "on chain",
    chainId,
    "epoch",
    epochId
  );

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
    // reindexCollateralEvents(market, Number(epochId)),
  ]);
  console.log("finished reindexing market", address, "on chain", chainId);
}

export async function reindexMissingBlocks(
  chainId: number,
  address: string,
  epochId: string,
  model: "ResourcePrice" | "Event"
) {
  console.log(
    `Starting reindex of missing ${model}s for market ${chainId}:${address}, epoch ${epochId}`
  );

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

  if (model === "ResourcePrice") {
    // Get block numbers using the price indexer client
    const { startBlockNumber, endBlockNumber, error } =
      await getMarketStartEndBlock(
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
    for (
      let blockNumber = startBlockNumber;
      blockNumber <= endBlockNumber;
      blockNumber++
    ) {
      if (!existingBlockNumbersSet.has(blockNumber)) {
        missingBlockNumbers.push(blockNumber);
      }
    }

    await marketInfo.priceIndexer.indexBlocks(market, missingBlockNumbers);
  } else {
    await Promise.all([
      reindexMarketEvents(market, marketInfo.deployment.abi, Number(epochId)),
      // reindexCollateralEvents(market, Number(epochId)),
    ]);
  }

  console.log(
    `Finished reindexing ${model}s for market ${address} on chain ${chainId}`
  );
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
    const model = process.argv[6] as "ResourcePrice" | "Event";

    if (
      isNaN(chainId) ||
      !address ||
      !epochId ||
      !["ResourcePrice", "Event"].includes(model)
    ) {
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
