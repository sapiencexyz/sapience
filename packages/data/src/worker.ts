import dataSource, { initializeDataSource, marketRepository } from "./db";
import { PublicClient } from "viem";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import {
  indexMarketEvents,
  indexMarketEventsRange,
  initializeMarket,
} from "./util/marketUtil"; // Assuming you have this function
import {
  createOrUpdateEpochFromContract,
  createOrUpdateMarketFromContract,
  getBlockRanges,
  getTimestampsForReindex,
  mainnetPublicClient,
} from "./util/reindexUtil";
import MARKETS from "./markets";
import { Market } from "./entity/Market";
import EvmIndexer from "./processes/evmIndexer";

async function main() {
  await initializeDataSource();
  const indexJobs = [];

  // Loop over MARKETS and upsert Market data with the stuff in that file, for upsert findBy chainid and address
  // upsert name, address, chainId, deployBlockNumber, deployTimestamp, public
  // call getMarket to populate additional data
  for (const m of MARKETS) {
    const deployment = m.deployment;
    if (!deployment) {
      continue;
    }

    await initializeMarket(deployment, m);

    // call indexMarket(market.id)
    const indexerClient = new EvmIndexer(m.marketChainId);
    indexJobs.push(indexMarketEvents(indexerClient.client, deployment));
    // call indexPrice(market.id)
    const priceIndexerClient = m.priceIndexer.client;
    indexJobs.push(
      indexBaseFeePerGas(
        priceIndexerClient,
        m.marketChainId,
        deployment.address
      )
    );
  }
  //TODO: optimize loop with promise.all

  // Loop over MARKETS and kick off market indexer and price indexer in a Promise, skip if market.deployment is null
  // indexMarket(market.id)
  // indexPrice(market.id)

  await Promise.all(indexJobs);
}

main();

// processBlockForMarket(market.id, Block)
// new epoch event and upsert an epoch to the database
// upsert trade, new lp event, etc.

// indexMarket(market.id)
// get chainid/address from market entity in database
// start the listener
// listener sees new block, calls processBlockForMarket(market.id, blockNumber)

// reindexMarket(market.id)
// get deployBlockNumber from market entity in database
// get chainId/address from market entity in database
// loop over blocks between deployBlockNumber and now (or end if we hit an error signfying we've caught up)
// processBlockForMarket
async function reindexMarket(marketAddress: string) {
  const marketDeployment = MARKETS.find(
    (m) => m.deployment?.address === marketAddress
  );
  if (!marketDeployment) {
    throw new Error(`Market not found for address ${marketAddress}`);
  }
  if (!marketDeployment.deployment) {
    throw new Error(`Deployment not found for address ${marketAddress}`);
  }

  await initializeMarket(marketDeployment.deployment, marketDeployment);
  const indexerClient = new EvmIndexer(marketDeployment.marketChainId);
  const deploymentBlockNumber =
    marketDeployment.deployment.deployTxnBlockNumber;
  const endBlock = await indexerClient.client.getBlockNumber();
  await indexMarketEventsRange(
    indexerClient.client,
    Number(deploymentBlockNumber),
    Number(endBlock),
    marketAddress,
    marketDeployment.deployment.abi
  );
}

// indexPrice(market.id)
// market.priceIndexer.watchBlocks(market.chainId)

// reindexPrice(market.id)
async function reindexPrice(marketAddress: string) {
  const marketDeployment = MARKETS.find(
    (m) => m.deployment?.address === marketAddress
  );
  if (!marketDeployment) {
    throw new Error(`Market not found for address ${marketAddress}`);
  }
  if (!marketDeployment.deployment) {
    throw new Error(`Deployment not found for address ${marketAddress}`);
  }
  const priceIndexerClient = marketDeployment.priceIndexer.client;
  const start = Number(marketDeployment.deployment.deployTxnBlockNumber);
  const end = await priceIndexerClient.getBlockNumber();
  await indexBaseFeePerGasRange(
    priceIndexerClient,
    start,
    Number(end),
    marketDeployment.marketChainId,
    marketAddress
  );
}
// get starting block from market
// loop over blocks and call market.priceIndexer.getPriceFromBlock

/*
async function initializeMarkets() {
  await initializeDataSource();
  // TODO: optimize with promise.all
  for (const marketConfig of MARKETS) {
    const { deployment, chainId, publicClient } = marketConfig;
    if (!deployment) continue;
    const market = await createOrUpdateMarketFromContract(
      publicClient,
      deployment,
      chainId
    );
    await createOrUpdateEpochFromContract(publicClient, deployment, 1, market);
  }
}

// TODO: confirm whether reindexing picks up initial contract events of epoch creation and market initialization
export async function reindexNetwork(
  client: PublicClient,
  contractDeployment: ContractDeployment | undefined,
  chainId: number,
  epoch?: number,
  startTime?: number,
  endTime?: number
) {
  if (!contractDeployment) {
    console.error(`Deployment package not available. Cannot reindex network.`);
    return;
  }
  await initializeDataSource();

  const market = await createOrUpdateMarketFromContract(
    client,
    contractDeployment,
    chainId
  );

  if (epoch) {
    await createOrUpdateEpochFromContract(
      client,
      contractDeployment,
      epoch,
      market
    );
  } else {
    await createOrUpdateEpochFromContract(
      client,
      contractDeployment,
      0,
      market,
      true
    );
  }

  //  check for hardcoded timestamps
  let startTimestamp: number | null | undefined = startTime;
  let endTimestamp: number | null | undefined = endTime;

  // if no start/end timestamps are provided, get them from the database or contract
  if (!startTimestamp || !endTimestamp) {
    const timestamps = await getTimestampsForReindex(
      client,
      contractDeployment,
      chainId,
      epoch
    );
    startTimestamp = timestamps.startTimestamp;
    endTimestamp = timestamps.endTimestamp;
  }

  // if not there throw error
  if (!startTimestamp || !endTimestamp) {
    throw new Error("Invalid timestamps");
  }

  console.log("startTimestamp", startTimestamp);
  console.log("endTimestamp", endTimestamp);

  getBlockRanges(startTimestamp, endTimestamp, client)
    .then(({ gasStart, gasEnd, marketStart, marketEnd }) => {
      console.log(`Reindexing gas between blocks ${gasStart} and ${gasEnd}`);
      console.log(
        `Reindexing market between blocks ${marketStart} and ${marketEnd}`
      );

      Promise.all([
        indexBaseFeePerGasRange(
          mainnetPublicClient,
          Number(gasStart),
          Number(gasEnd),
          chainId,
          contractDeployment.address
        ),
        indexMarketEventsRange(
          client,
          Number(marketStart),
          Number(marketEnd),
          contractDeployment.address,
          contractDeployment.abi
        ),
      ])
        .then(() => {
          console.log("Done!");
        })
        .catch((error) => {
          console.error("An error occurred:", error);
        });
    })
    .catch((error) => {
      console.error("Error getting block ranges:", error);
    });
}

console.log("Initializing markets...");
initializeMarkets().then(() => {
  const jobs = [];

  for (const marketConfig of MARKETS) {
    const { deployment, marketChainId, publicClient } = marketConfig;
    if (deployment && process.env.NODE_ENV !== "production") {
      jobs.push(
        indexBaseFeePerGas(mainnetPublicClient, marketChainId, deployment.address),
        indexMarketEvents(publicClient, deployment)
      );
    }
  }

  if (jobs.length > 0) {
    Promise.all(jobs).catch((error) => {
      console.error("Error running processes in parallel:", error);
    });
  } else {
    console.warn("No jobs to run. Make sure deployments are available.");
  }
});
*/
