import dataSource, { initializeDataSource } from "./db";
import { Abi, PublicClient } from "viem";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import { indexMarketEvents, indexMarketEventsRange } from "./processes/market"; // Assuming you have this function
import { sepolia, hardhat } from "viem/chains";
import { Market } from "./entity/Market";
import { Epoch } from "./entity/Epoch";
import {
  cannonPublicClient,
  createOrUpdateEpochFromContract,
  createOrUpdateMarketFromContract,
  getBlockRanges,
  getTimestampsForReindex,
  mainnetPublicClient,
  sepoliaPublicClient,
} from "./util/reindexUtil";
import { ContractDeployment } from "./interfaces/interfaces";
import { EpochParams } from "./entity/EpochParams";

let FoilLocal: ContractDeployment | undefined;
let FoilSepolia: ContractDeployment | undefined;

try {
  FoilLocal = require("@/protocol/deployments/13370/Foil.json");
} catch (error) {
  console.warn("FoilLocal not available");
}

try {
  FoilSepolia = require("@/protocol/deployments/11155111/Foil.json");
} catch (error) {
  console.warn("FoilSepolia not available");
}

const MARKETS = [
  {
    name: "LOCAL",
    deployment: FoilLocal,
    chainId: hardhat.id,
    publicClient: cannonPublicClient,
  },
  {
    name: "SEPOLIA",
    deployment: FoilSepolia,
    chainId: sepolia.id,
    publicClient: sepoliaPublicClient,
  },
  {
    name: "SEPOLIA-1",
    deployment: {
      address: "0xfb17d7f02f4d29d900838f80605091e3778e38ee",
      abi: FoilSepolia?.abi || ({} as Abi),
    },
    chainId: sepolia.id,
    publicClient: sepoliaPublicClient,
  },
];

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

if (process.argv.length < 3) {
  console.log("initializing markets...");
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
} else {
  const args = process.argv.slice(2);

  if (args[0] === "reindex") {
    const targetMarketName = args[1]?.toUpperCase();
    // additional optional args for reindexing
    const epoch = args[2] ? Number(args[2]) : undefined;
    const startTime = args[3] ? Number(args[3]) : undefined;
    const endTime = args[4] ? Number(args[4]) : undefined;

    const marketConfig = MARKETS.find(
      (market) => market.name === targetMarketName
    );

    if (marketConfig && marketConfig.deployment) {
      console.log(`Reindexing ${marketConfig.name} network!`);
      reindexNetwork(
        marketConfig.publicClient,
        marketConfig.deployment,
        marketConfig.chainId,
        epoch,
        startTime,
        endTime
      );
    } else {
      console.error(
        `Market ${targetMarketName} not found or deployment missing.`
      );
    }
  }
}
