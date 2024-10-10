import dataSource, { initializeDataSource } from "./db";
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

main();

export async function reindexMarket(chainId: number, address: string) {
  const marketInfo = MARKET_INFO.find(
    (m) => m.marketChainId === chainId && m.deployment.address === address
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
