import { initializeDataSource } from "./db";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./indexPriceFunctions/chain";
import {
  indexMarketEvents,
  indexMarketEventsRange,
  initializeMarket,
} from "./util/marketUtil"; // Assuming you have this function
import { MARKET_INFO } from "./constants";
import EvmIndexer from "./indexPriceFunctions/evmIndexer";

async function main() {
  await initializeDataSource();
  let jobs = [];

  for (const marketInfo of MARKET_INFO) {
    const market = await initializeMarket(marketInfo);
    jobs.push(indexMarketEvents(market, marketInfo.deployment.abi));
    jobs.push(marketInfo.priceIndexer.watchBlocksForMarket(market));
  }

  await Promise.all(jobs);
}

main();

/*
SOMETHING LIKE THIS FOR REINDEXING

export const indexBaseFeePerGasRange = async (
  publicClient: PublicClient,
  start: number,
  end: number,
  chainId: number,
  address: string
) => {
  await initializeDataSource();
  const priceRepository = dataSource.getRepository(IndexPrice);
  const marketRepository = dataSource.getRepository(Market);

  const market = await marketRepository.findOne({
    where: { chainId, address },
  });
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}`
    );
  }

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    try {
      console.log("Indexing gas from block ", blockNumber);
      const block = await publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
      });
      const value = block.baseFeePerGas || BigInt("0");
      const timestamp = block.timestamp.toString();

      const price = new IndexPrice();
      price.market = market;
      price.timestamp = timestamp;
      price.value = value.toString();
      price.blockNumber = blockNumber.toString();

      await priceRepository.upsert(price, ["market", "timestamp"]);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};

*/

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
  const marketInfo = MARKET_INFO.find(
    (m) => m.deployment?.address === marketAddress
  );
  if (!marketInfo) {
    throw new Error(`Market not found for address ${marketAddress}`);
  }

  await initializeMarket(marketInfo);
  const indexerClient = new EvmIndexer(marketInfo.marketChainId);
  const deploymentBlockNumber =
    marketInfo.deployment.deployTxnBlockNumber;
  const endBlock = await indexerClient.client.getBlockNumber();
  await indexMarketEventsRange(
    indexerClient.client,
    Number(deploymentBlockNumber),
    Number(endBlock),
    marketAddress,
    marketInfo.deployment.abi
  );
}

// indexPrice(market.id)
// market.priceIndexer.watchBlocks(market.chainId)

// reindexPrice(market.id)
async function reindexPrice(marketAddress: string) {
  const marketDeployment = MARKET_INFO.find(
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
  for (const marketConfig of MARKET_INFO) {
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

  for (const marketConfig of MARKET_INFO) {
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
