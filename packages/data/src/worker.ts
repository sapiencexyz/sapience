import "reflect-metadata";
import { initializeDataSource } from "./db";
import {
  indexMarketEvents,
  initializeMarket,
  reindexMarketEvents,
} from "./controllers/market";
import { MARKET_INFO } from "./markets";
import { createOrUpdateEpochFromContract } from "./controllers/marketHelpers";

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
    marketInfo.priceIndexer.indexBlockPriceFromTimestamp(
      market,
      initialTimestamp || market.deployTimestamp
    ),
  ]);
  console.log("finished reindexing market", address, "on chain", chainId);
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
} else {
  main();
}
