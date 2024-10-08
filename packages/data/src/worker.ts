import { initializeDataSource } from "./db";
import { PublicClient } from "viem";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import { indexMarketEvents, indexMarketEventsRange } from "./processes/market"; // Assuming you have this function
import {
  createOrUpdateEpochFromContract,
  createOrUpdateMarketFromContract,
  getBlockRanges,
  getTimestampsForReindex,
  mainnetPublicClient,
} from "./util/reindexUtil";
import { ContractDeployment } from "./interfaces/interfaces";
import MARKETS from "./markets";

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
    const { deployment, chainId, publicClient } = marketConfig;
    if (deployment && process.env.NODE_ENV !== "production") {
      jobs.push(
        indexBaseFeePerGas(mainnetPublicClient, chainId, deployment.address),
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