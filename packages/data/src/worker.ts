import dataSource, { initializeDataSource } from "./db";
import { Abi, PublicClient } from "viem";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import { indexMarketEvents, indexMarketEventsRange } from "./processes/market"; // Assuming you have this function
import { sepolia, hardhat } from "viem/chains";
import { Market } from "./entity/Market";
import { Epoch } from "./entity/Epoch";
import {
  cannonPublicClient,
  getBlockRanges,
  getTimestampsForReindex,
  mainnetPublicClient,
  sepoliaPublicClient,
} from "./util/reindexUtil";
import { ContractDeployment } from "./interfaces/interfaces";

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

// TODO: Get this data from smart contract queries
async function initializeMarkets() {
  await initializeDataSource();
  const marketRepository = dataSource.getRepository(Market);
  const epochRepository = dataSource.getRepository(Epoch);

  // Helper function to create or find epoch
  async function createOrFindEpoch(market: Market) {
    let epoch = await epochRepository.findOne({
      where: { market: { id: market.id }, epochId: 1 },
    });

    if (!epoch) {
      epoch = new Epoch();
      epoch.epochId = 1;
      epoch.market = market;
      await epochRepository.save(epoch);
    }

    return epoch;
  }

  // LOCAL
  if (FoilLocal) {
    let localMarket = await marketRepository.findOne({
      where: { address: FoilLocal.address, chainId: hardhat.id },
      relations: ["epochs"],
    });
    if (!localMarket) {
      localMarket = new Market();
      localMarket.address = FoilLocal.address;
      localMarket.chainId = hardhat.id;
      localMarket = await marketRepository.save(localMarket);
    }
    await createOrFindEpoch(localMarket);
  }

  // SEPOLIA
  if (FoilSepolia) {
    let sepoliaMarket = await marketRepository.findOne({
      where: { address: FoilSepolia.address, chainId: sepolia.id },
      relations: ["epochs"],
    });
    if (!sepoliaMarket) {
      sepoliaMarket = new Market();
      sepoliaMarket.address = FoilSepolia.address;
      sepoliaMarket.chainId = sepolia.id;
      sepoliaMarket = await marketRepository.save(sepoliaMarket);
    }
    await createOrFindEpoch(sepoliaMarket);
  }
}

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
  initializeMarkets().then(() => {
    let jobs = [];

    if (FoilSepolia) {
      jobs.push(
        indexBaseFeePerGas(
          mainnetPublicClient,
          sepolia.id,
          FoilSepolia.address
        ),
        indexMarketEvents(sepoliaPublicClient, FoilSepolia)
      );
    }

    if (process.env.NODE_ENV !== "production" && FoilLocal) {
      jobs.push(
        indexBaseFeePerGas(mainnetPublicClient, hardhat.id, FoilLocal.address),
        indexMarketEvents(cannonPublicClient, FoilLocal)
      );
    }

    if (jobs.length > 0) {
      Promise.all(jobs).catch((error) => {
        console.error("Error running processes in parallel:", error);
      });
    } else {
      console.warn(
        "No jobs to run. Make sure FoilLocal or FoilSepolia are available."
      );
    }
  });
} else {
  const args = process.argv.slice(2);

  if (args[0] === "reindex-testnet") {
    console.log("Reindexing Testnet!");
    reindexNetwork(sepoliaPublicClient, FoilSepolia, sepolia.id);
  } else if (args[0] === "reindex-local") {
    console.log("Reindexing Local!");
    reindexNetwork(cannonPublicClient, FoilLocal, hardhat.id);
  }
}
