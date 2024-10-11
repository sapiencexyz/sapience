import { initializeDataSource } from "./db";
import {
  indexMarketEvents,
  initializeMarket,
  reindexMarketEvents,
} from "./controllers/market";
import { MARKET_INFO } from "./constants";
import { createOrUpdateEpochFromContract } from "./controllers/marketHelpers";

async function main() {
  await initializeDataSource();
  let jobs = [];

  for (const marketInfo of MARKET_INFO) {
    const market = await initializeMarket(marketInfo);
    // initialize epoch
    await createOrUpdateEpochFromContract(marketInfo, market);
    jobs.push(indexMarketEvents(market, marketInfo.deployment.abi));
    jobs.push(marketInfo.priceIndexer.watchBlocksForMarket(market));
  }

  await Promise.all(jobs);
}

export async function reindexMarket(chainId: number, address: string) {
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
      market.deployTimestamp
    ),
  ]);
}

if (process.argv[process.argv.length - 1] === "reindexMarket") {
  const callReindex = async () => {
    const CHAIN = 13370; // adjust as needed
    const ADDRESS = "0x90FA2c5b2f2F1B60B5ed9255E2283C17d8E02b63"; //adjust as needed
    await reindexMarket(CHAIN, ADDRESS);
    console.log("DONE");
  };
  callReindex();
} else {
  main();
}
