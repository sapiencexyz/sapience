import dataSource, { initializeDataSource } from "./db";
import { Abi, createPublicClient, http, webSocket } from "viem";
import { indexBaseFeePerGas, indexBaseFeePerGasRange } from "./processes/chain";
import { indexMarketEvents, indexMarketEventsRange } from "./processes/market"; // Assuming you have this function
import { mainnet, sepolia, hardhat } from "viem/chains";
import FoilLocal from "@/protocol/deployments/13370/Foil.json";
import FoilSepolia from "@/protocol/deployments/11155111/Foil.json";
import { Market } from "./entity/Market";
import { Epoch } from "./entity/Epoch";
import getBlockByTimestamp from "./getBlockByTimestamp";

const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://sepolia.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

hardhat.id = 13370 as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http("http://localhost:8545"),
});

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

  // SEPOLIA
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

  const allEpochs = await epochRepository.find({ relations: ["market"] });
  console.log("All Epochs:", allEpochs);

  const allMarkets = await marketRepository.find({ relations: ["epochs"] });
  console.log("All Markets:", allMarkets);
  console.log("First epoch in market:", allMarkets[0].epochs);
}

export async function reindexTestnet() {
  console.log("Reindexing Testnet!");

  async function getBlockRanges() {
    // Pull start/end dates from database eventually
    const gasStart = await getBlockByTimestamp(mainnetPublicClient, 1723479600);
    const gasEnd = await getBlockByTimestamp(mainnetPublicClient, 1726405200)  || await mainnetPublicClient.getBlock();
    const marketStart = await getBlockByTimestamp(sepoliaPublicClient, 1723479600);
    const marketEnd = await getBlockByTimestamp(sepoliaPublicClient, 1726405200) || await sepoliaPublicClient.getBlock();
    return { gasStart: gasStart.number, gasEnd: gasEnd.number, marketStart: marketStart.number, marketEnd: marketEnd.number };
  }

  getBlockRanges().then(({ gasStart, gasEnd, marketStart, marketEnd }) => {
    console.log(`Reindexing gas between blocks ${gasStart} and ${gasEnd}`);
    console.log(`Reindexing market between blocks ${marketStart} and ${marketEnd}`);

    Promise.all([
      indexBaseFeePerGasRange(
        mainnetPublicClient,
        Number(gasStart), 
        Number(gasEnd),
        sepolia.id,
        FoilSepolia.address
      ),
      indexMarketEventsRange(
        sepoliaPublicClient,
        Number(marketStart),
        Number(marketEnd),
        FoilSepolia.address,
        FoilSepolia.abi as Abi
      )
    ]).then(() => {
      console.log("Done!");
    }).catch(error => {
      console.error("An error occurred:", error);
    });
  }).catch(error => {
    console.error("Error getting block ranges:", error);
  });
}

if (process.argv.length < 3) {
  initializeMarkets().then(() => {
    let jobs = [
      indexBaseFeePerGas(mainnetPublicClient, sepolia.id, FoilSepolia.address),
      indexMarketEvents(
        sepoliaPublicClient,
        FoilSepolia as { address: string; abi: Abi }
      )
    ];

    if(process.env.NODE_ENV !== "production"){
      jobs = jobs.concat([
        indexBaseFeePerGas(mainnetPublicClient, hardhat.id, FoilLocal.address),
        indexMarketEvents(
          cannonPublicClient,
          FoilLocal as { address: string; abi: Abi }
        ),
      ]);
    }

    Promise.all(jobs).catch((error) => {
      console.error("Error running processes in parallel:", error);
    });
  });
} else {
  const args = process.argv.slice(2);
  if (args[0] === "reindex-testnet") {
    reindexTestnet();
  }
}
