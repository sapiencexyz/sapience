import "tsconfig-paths/register";
import dataSource, {
  epochRepository,
  eventRepository,
  initializeDataSource,
  marketRepository,
} from "../db";
import { Event } from "../entity/Event";
import { EpochParams } from "../entity/EpochParams";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import { Abi, decodeEventLog, Log, PublicClient, 
  createPublicClient,
  http,
  Block,
  Chain,
  webSocket} from "viem";
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  MarketInfo,
  LiquidityPositionClosedEventLog,
  LiquidityPositionCreatedEventLog,
  LiquidityPositionModifiedEventLog,
  TradePositionEventLog,
} from "../interfaces/interfaces";
import { TOKEN_PRECISION } from "../constants";
import { mainnet, sepolia, hardhat, cannon } from "viem/chains";
import EvmIndexer from "../processes/evmIndexer";

const bigintReplacer = (key: string, value: any) => {
  if (typeof value === "bigint") {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const initializeMarket = async (
  marketInfo: MarketInfo
) => {
  let existingMarket = await marketRepository.findOne({
    where: {
      address: marketInfo.deployment.address,
      chainId: marketInfo.marketChainId,
    },
  });
  const market = existingMarket || new Market();

  // get market and epoch from contract
  const marketReadResult: any = await marketInfo.priceIndexer.client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: marketInfo.deployment.abi,
    functionName: "getMarket",
  });
  console.log("marketReadResult", marketReadResult);

  let updatedMarket = market;
  if (!updatedMarket) {
    // check if market already exists in db
    let existingMarket = await marketRepository.findOne({
      where: { address: marketInfo.deployment.address, chainId: marketInfo.marketChainId },
      relations: ["epochs"],
    });
    updatedMarket = existingMarket || new Market();
  }

  // populate market data from markets file
  updatedMarket.name = marketInfo.name;
  updatedMarket.public = marketInfo.public;
  updatedMarket.address = marketInfo.deployment.address;
  updatedMarket.deployTxnBlockNumber = marketInfo.deployment.deployTxnBlockNumber;
  updatedMarket.deployTimestamp = marketInfo.deployment.deployTimestamp;
  updatedMarket.chainId = marketInfo.marketChainId;
  updatedMarket.owner = marketReadResult[0];
  updatedMarket.collateralAsset = marketReadResult[1];
  const epochParamsRaw = marketReadResult[2];
  const marketEpochParams: EpochParams = {
    ...epochParamsRaw,
    assertionLiveness: epochParamsRaw.assertionLiveness.toString(),
    bondAmount: epochParamsRaw.bondAmount.toString(),
  };
  updatedMarket.epochParams = marketEpochParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://sepolia.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

export const cannonPublicClient = createPublicClient({
  chain: cannon,
  transport: http("http://localhost:8545"),
});

// Function to create a custom chain configuration
function createCustomChain(rpcUrl: string): Chain {
  return {
    id: 0,
    name: "Custom",
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    nativeCurrency: {
      decimals: TOKEN_PRECISION,
      name: "Ether",
      symbol: "ETH",
    },
  };
}

// Function to create a public client using the provided RPC URL
function createClient(rpcUrl: string): PublicClient {
  const customChain = createCustomChain(rpcUrl);
  return createPublicClient({
    chain: customChain,
    transport: http(),
  });
}

async function getBlockByTimestamp(
  client: ReturnType<typeof createClient>,
  timestamp: number
): Promise<Block> {
  // Get the latest block number
  const latestBlockNumber = await client.getBlockNumber();

  // Get the latest block using the block number
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  // Initialize the binary search range
  let low = 0n;
  let high = latestBlock.number;
  let closestBlock: Block | null = null;

  // Binary search for the block with the closest timestamp
  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    if (block.timestamp < timestamp) {
      low = mid + 1n;
    } else {
      high = mid - 1n;
      closestBlock = block;
    }
  }

  // If the closest block's timestamp is greater than the given timestamp, it is our match
  // Otherwise, we need to get the next block (if it exists)
  if (closestBlock?.number && closestBlock.timestamp < timestamp) {
    const nextBlock = await client.getBlock({
      blockNumber: closestBlock.number + 1n,
    });
    if (nextBlock) {
      closestBlock = nextBlock;
    }
  }

  return closestBlock!;
}

export const getTimestampsForReindex = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  epochId?: number
) => {
  const now = Math.round(new Date().getTime() / 1000);

  // if no epoch is provided, get the latest one from the contract
  if (!epochId) {
    const latestEpoch: any = await client.readContract({
      address: contractDeployment.address as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: "getLatestEpoch",
    });
    epochId = Number(latestEpoch[0]);
    return {
      startTimestamp: Number(latestEpoch[1]),
      endTimestamp: Math.min(Number(latestEpoch[2]), now),
    };
  }

  // get info from database
  const epochRepository = dataSource.getRepository(Epoch);
  const epoch = await epochRepository.findOne({
    where: {
      epochId,
      market: { address: contractDeployment.address, chainId },
    },
    relations: ["market"],
  });

  if (!epoch || !epoch.startTimestamp || !epoch.endTimestamp) {
    // get info from contract
    console.log("fetching epoch from contract to get timestamps...");
    const epochContract: any = await client.readContract({
      address: contractDeployment.address as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: "getEpoch",
      args: [`${epochId}`],
    });
    return {
      startTimestamp: Number(epochContract[0]),
      endTimestamp: Math.min(Number(epochContract[1]), now),
    };
  }

  return {
    startTimestamp: Number(epoch.startTimestamp),
    endTimestamp: Math.min(Number(epoch.endTimestamp), now),
  };
};

export async function getBlockRanges(
  startTimestamp: number,
  endTimestamp: number,
  publicClient: PublicClient
) {
  // TODO: wrap these in a promise.all once rate limiting is resolved

  console.log("Getting gas start...");
  const gasStart = await getBlockByTimestamp(
    mainnetPublicClient,
    startTimestamp
  );
  console.log(`Got gas start: ${gasStart.number}. Getting gas end...`);

  const gasEnd =
    (await getBlockByTimestamp(mainnetPublicClient, endTimestamp)) ||
    (await mainnetPublicClient.getBlock());
  console.log(`Got gas end:  ${gasEnd.number}.  Getting market start....`);

  const marketStart = await getBlockByTimestamp(publicClient, startTimestamp);
  console.log(
    `Got market start: ${marketStart.number}. Getting market end....`
  );

  const marketEnd =
    (await getBlockByTimestamp(publicClient, endTimestamp)) ||
    (await publicClient.getBlock());
  console.log(
    `Got market end: ${marketEnd.number}. Finished getting block ranges.`
  );

  return {
    gasStart: gasStart.number,
    gasEnd: gasEnd.number,
    marketStart: marketStart.number,
    marketEnd: marketEnd.number,
  };
}

export const createOrUpdateMarketFromContract = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  initialMarket?: Market
) => {
  // get market and epoch from contract
  const marketReadResult: any = await client.readContract({
    address: contractDeployment.address as `0x${string}`,
    abi: contractDeployment.abi,
    functionName: "getMarket",
  });
  console.log("marketReadResult", marketReadResult);

  let updatedMarket = initialMarket;
  if (!updatedMarket) {
    // check if market already exists in db
    let existingMarket = await marketRepository.findOne({
      where: { address: contractDeployment.address, chainId },
      relations: ["epochs"],
    });
    updatedMarket = existingMarket || new Market();
  }

  // update market params appropriately
  updatedMarket.address = contractDeployment.address;
  updatedMarket.deployTxnBlockNumber = contractDeployment.deployTxnBlockNumber;
  updatedMarket.deployTimestamp = contractDeployment.deployTimestamp;
  updatedMarket.chainId = chainId;
  updatedMarket.owner = marketReadResult[0];
  updatedMarket.collateralAsset = marketReadResult[1];
  const epochParamsRaw = marketReadResult[2];
  const marketEpochParams: EpochParams = {
    ...epochParamsRaw,
    assertionLiveness: epochParamsRaw.assertionLiveness.toString(),
    bondAmount: epochParamsRaw.bondAmount.toString(),
  };
  updatedMarket.epochParams = marketEpochParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

export const createOrUpdateEpochFromContract = async (
  client: PublicClient,
  contractDeployment: Deployment,
  epoch: number,
  market: Market,
  getLatestEpoch?: boolean
) => {
  const epochRepository = dataSource.getRepository(Epoch);

  const functionName = getLatestEpoch ? "getLatestEpoch" : "getEpoch";
  const args = getLatestEpoch ? [] : [epoch];

  // get epoch from contract
  const epochReadResult: any = await client.readContract({
    address: contractDeployment.address as `0x${string}`,
    abi: contractDeployment.abi,
    functionName,
    args,
  });
  console.log("epochReadResult", epochReadResult);
  const epochId = getLatestEpoch ? Number(epochReadResult[0]) : epoch;

  // check if epoch already exists in db
  let existingEpoch = await epochRepository.findOne({
    where: {
      market: { address: contractDeployment.address },
      epochId,
    },
  });
  const updatedEpoch = existingEpoch || new Epoch();

  const idxAdjustment = getLatestEpoch ? 1 : 0; // getLatestEpoch returns and extra param at 0 index

  updatedEpoch.epochId = epochId;
  updatedEpoch.startTimestamp = epochReadResult[0 + idxAdjustment].toString();
  updatedEpoch.endTimestamp = epochReadResult[1 + idxAdjustment].toString();
  updatedEpoch.settled = epochReadResult[7 + idxAdjustment];
  updatedEpoch.settlementPriceD18 =
    epochReadResult[8 + idxAdjustment].toString();
  const epochParamsRaw = epochReadResult[9 + idxAdjustment];
  const epochParams: EpochParams = {
    ...epochParamsRaw,
    assertionLiveness: epochParamsRaw.assertionLiveness.toString(),
    bondAmount: epochParamsRaw.bondAmount.toString(),
  };
  updatedEpoch.market = market;
  updatedEpoch.epochParams = epochParams;
  await epochRepository.save(updatedEpoch);
};


export const indexMarketEvents = async (
  publicClient: PublicClient,
  deployment: Deployment
) => {
  await initializeDataSource();
  const chainId = await publicClient.getChainId();

  // Process log data
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const blockNumber = log.blockNumber || 0n;
      const block = await publicClient.getBlock({
        blockNumber,
      });

      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      // Extract epochId from logData (adjust this based on your event structure)
      const epochId = logData.args?.epochId || 0;
      console.log("logData is", logData);

      await handleMarketEventUpsert(
        chainId,
        deployment.address,
        epochId,
        blockNumber,
        block.timestamp,
        logIndex,
        logData
      );
    }
  };

  // Start watching for new events
  console.log(`Watching contract events for ${deployment.address}`);
  publicClient.watchContractEvent({
    address: deployment.address as `0x${string}`,
    abi: deployment.abi,
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

export const indexMarketEventsRange = async (
  publicClient: PublicClient,
  startBlock: number,
  endBlock: number,
  contractAddress: string,
  contractAbi: Abi
) => {
  await initializeDataSource();
  const chainId = await publicClient.getChainId();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.log("Indexing market events from block ", blockNumber);
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress as `0x${string}`,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        const decodedLog = decodeEventLog({
          abi: contractAbi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);
        const blockNumber = log.blockNumber;
        const block = await publicClient.getBlock({
          blockNumber: log.blockNumber,
        });
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);

        // Extract epochId from logData (adjust this based on your event structure)
        const epochId = logData.args?.epochId || 0;

        await handleMarketEventUpsert(
          chainId,
          contractAddress,
          epochId,
          blockNumber,
          block.timestamp,
          logIndex,
          logData
        );
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};

const handleMarketEventUpsert = async (
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: any
) => {
  console.log("Upserting event:", {
    chainId,
    address,
    epochId,
    blockNumber,
    logIndex,
    logData,
  });

  // Find or create the market
  let market = await marketRepository.findOne({
    where: { chainId, address },
    relations: ["epochs", "epochs.market"],
  });

  if (logData.eventName === "MarketInitialized") {
    console.log("creating market: ", logData);
    const marketCreatedArgs = logData.args as MarketCreatedUpdatedEventLog;
    market = await createOrUpdateMarketFromEvent(
      marketCreatedArgs,
      chainId,
      address,
      market
    );
  }

  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}`
    );
  }

  if (logData.eventName === "MarketUpdated") {
    console.log("updating market: ", logData);
    // update market
    const marketUpdatedArgs = logData.args as MarketCreatedUpdatedEventLog;
    market = await createOrUpdateMarketFromEvent(
      marketUpdatedArgs,
      chainId,
      address,
      market
    );
  }

  // handle epoch
  let epoch = market.epochs.find((e) => e.epochId === epochId);

  if (logData.eventName === "EpochCreated") {
    // create new epoch
    console.log("creating epoch: ", logData);
    const epochCreatedArgs = logData.args as EpochCreatedEventLog;
    epoch = await createEpochFromEvent(epochCreatedArgs, market);
  } else if (!epoch) {
    // get latest epoch id from repository
    console.log("getting latest epoch from repository...");
    epoch =
      (await epochRepository.findOne({
        where: { market: { id: market.id } },
        order: { epochId: "DESC" },
        relations: ["market"],
      })) || undefined;
  }
  console.log("event epoch:", epoch);

  // throw if epoch not found/created properly
  if (!epoch) {
    throw new Error(`No epochs found for market ${market.address}`);
  }

  // process market settled events
  if (logData.eventName === "MarketSettled") {
    console.log("Market settled event: ", logData);
    epoch.settled = true;
    epoch.settlementPriceD18 = logData.args.settlementPriceD18;
    await epochRepository.save(epoch);
  }

  // check if event has already been processed
  const existingEvent = await eventRepository.findOne({
    where: {
      epoch: { id: epoch.id },
      blockNumber: blockNumber.toString(),
      logIndex,
    },
    relations: ["epoch"],
  });
  if (!existingEvent) {
    console.log("inserting new event");
    // Create a new Event entity
    const newEvent = new Event();
    newEvent.epoch = epoch;
    newEvent.blockNumber = blockNumber.toString();
    newEvent.timestamp = timeStamp.toString();
    newEvent.logIndex = logIndex;
    newEvent.logData = logData;

    // insert the event
    await eventRepository.insert(newEvent);
  } else {
    console.log("Event already processed");
  }
};

/**
 * Creates or updates a Market entity in the database from a MarketCreatedUpdatedEventLog event.
 * If originalMarket is provided, it will be updated with the new data. Otherwise, a new Market entity will be created.
 * @param eventArgs The event log data from the MarketCreatedUpdatedEventLog event.
 * @param chainId The chain id of the market.
 * @param address The address of the market.
 * @param originalMarket The original Market entity to be updated, if any.
 * @returns The saved Market entity.
 */
const createOrUpdateMarketFromEvent = async (
  eventArgs: MarketCreatedUpdatedEventLog,
  chainId: number,
  address: string,
  originalMarket?: Market | null
) => {
  const marketRepository = dataSource.getRepository(Market);

  let market = originalMarket || new Market();
  market.chainId = chainId;
  market.address = address;
  if (eventArgs.collateralAsset) {
    market.collateralAsset = eventArgs.collateralAsset;
  }
  market.epochParams = {
    baseAssetMinPriceTick: Number(eventArgs.epochParams.baseAssetMinPriceTick),
    baseAssetMaxPriceTick: Number(eventArgs.epochParams.baseAssetMaxPriceTick),
    feeRate: Number(eventArgs.epochParams.feeRate),
    assertionLiveness: eventArgs?.epochParams?.assertionLiveness.toString(),
    bondCurrency: eventArgs?.epochParams?.bondCurrency,
    bondAmount: eventArgs?.epochParams?.bondAmount.toString(),
    priceUnit: eventArgs?.epochParams?.priceUnit,
    uniswapPositionManager: eventArgs?.epochParams?.uniswapPositionManager,
    uniswapSwapRouter: eventArgs?.epochParams?.uniswapSwapRouter,
    uniswapQuoter: eventArgs?.epochParams?.uniswapQuoter,
    optimisticOracleV3: eventArgs?.epochParams?.optimisticOracleV3,
  };
  const newMarket = await marketRepository.save(market);
  return newMarket;
};

export const getTradeTypeFromEvent = (eventArgs: TradePositionEventLog) => {
  if (BigInt(eventArgs.finalPrice) > BigInt(eventArgs.initialPrice)) {
    return TransactionType.LONG;
  }
  return TransactionType.SHORT;
};

/**
 * Updates a Transaction with the relevant information from a LiquidityPositionModifiedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionModifiedEventLog args
 * @param isDecrease whether the event is a decrease or increase in liquidity
 */
export const updateTransactionFromLiquidityClosedEvent = async (
  newTransaction: Transaction,
  event: Event
) => {
  const positionRepository = dataSource.getRepository(Position);
  newTransaction.type = TransactionType.REMOVE_LIQUIDITY;

  const eventArgs = event.logData.args as LiquidityPositionClosedEventLog;
  const originalPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgs.positionId),
      epoch: {
        epochId: event.epoch.epochId,
        market: { address: event.epoch.market.address },
      },
    },
    relations: ["epoch", "epoch.market"],
  });
  if (!originalPosition) {
    throw new Error(`Position not found: ${eventArgs.positionId}`);
  }
  const collateralDeltaBigInt =
    BigInt("-1") * BigInt(originalPosition.collateral);
  newTransaction.baseTokenDelta = eventArgs.collectedAmount0;
  newTransaction.quoteTokenDelta = eventArgs.collectedAmount1;
  newTransaction.collateralDelta = collateralDeltaBigInt.toString();
};

/**
 * Updates a Transaction with the relevant information from a LiquidityPositionModifiedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionModifiedEventLog args
 * @param isDecrease whether the event is a decrease or increase in liquidity
 */
export const updateTransactionFromLiquidityModifiedEvent = async (
  newTransaction: Transaction,
  event: Event,
  isDecrease?: boolean
) => {
  const positionRepository = dataSource.getRepository(Position);
  newTransaction.type = isDecrease
    ? TransactionType.REMOVE_LIQUIDITY
    : TransactionType.ADD_LIQUIDITY;
  const eventArgsModifyLiquidity = event.logData
    .args as LiquidityPositionModifiedEventLog;
  console.log("eventArgsModifyLiquidity", eventArgsModifyLiquidity);
  const originalPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgsModifyLiquidity.positionId),
      epoch: {
        epochId: event.epoch.epochId,
        market: { address: event.epoch.market.address },
      },
    },
    relations: ["epoch", "epoch.market"],
  });
  if (!originalPosition) {
    // if position not found, get position from contract?
    /**
     i.e:
    const test = sepoliaPublicClient.readContract({
      address: FoilSepolia.address
      abi: FoilSepolia.abi,
      functionName: "getPosition",
      args: [eventArgsModifyLiquidity.positionId],
    })
      **/

    throw new Error(
      `Position not found: ${eventArgsModifyLiquidity.positionId}`
    );
  }
  const collateralDeltaBigInt =
    BigInt(eventArgsModifyLiquidity.collateralAmount) -
    BigInt(originalPosition.collateral ?? "0");
  newTransaction.baseTokenDelta = isDecrease
    ? (
        BigInt(event.logData.args.decreasedAmount0 ?? "0") * BigInt(-1)
      ).toString()
    : (event.logData.args.increasedAmount0 ?? "0");
  newTransaction.quoteTokenDelta = isDecrease
    ? (
        BigInt(event.logData.args.decreasedAmount1 ?? "0") * BigInt(-1)
      ).toString()
    : (event.logData.args.increasedAmount1 ?? "0");
  newTransaction.collateralDelta = collateralDeltaBigInt.toString();
};

/**
 * Updates a Transaction with the relevant information from a LiquidityPositionCreatedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionCreatedEventLog args
 */
export const updateTransactionFromAddLiquidityEvent = (
  newTransaction: Transaction,
  event: Event
) => {
  newTransaction.type = TransactionType.ADD_LIQUIDITY;
  const eventArgsAddLiquidity = event.logData
    .args as LiquidityPositionCreatedEventLog;
  newTransaction.baseTokenDelta = eventArgsAddLiquidity.addedAmount0;
  newTransaction.quoteTokenDelta = eventArgsAddLiquidity.addedAmount1;
  newTransaction.collateralDelta = eventArgsAddLiquidity.collateralAmount;
};

/**
 * Updates a Transaction with the relevant information from a TradePositionModifiedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the TradePositionModifiedEventLog args
 */
export const updateTransactionFromTradeModifiedEvent = async (
  newTransaction: Transaction,
  event: Event
) => {
  const eventArgsCreateTrade = event.logData.args as TradePositionEventLog;
  const positionRepository = dataSource.getRepository(Position);
  newTransaction.type = getTradeTypeFromEvent(
    event.logData.args as TradePositionEventLog
  );

  const initialPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgsCreateTrade.positionId),
      epoch: {
        epochId: event.epoch.epochId,
        market: { address: event.epoch.market.address },
      },
    },
    relations: ["epoch"],
  });

  const baseTokenInitial = initialPosition ? initialPosition.baseToken : "0";
  const quoteTokenInitial = initialPosition ? initialPosition.quoteToken : "0";
  const collateralInitial = initialPosition ? initialPosition.collateral : "0";

  newTransaction.baseTokenDelta = (
    BigInt(eventArgsCreateTrade.vGasAmount) -
    BigInt(baseTokenInitial)
  ).toString();
  newTransaction.quoteTokenDelta = (
    BigInt(eventArgsCreateTrade.vEthAmount) -
    BigInt(quoteTokenInitial)
  ).toString();
  newTransaction.collateralDelta = (
    BigInt(eventArgsCreateTrade.collateralAmount) - BigInt(collateralInitial)
  ).toString();

  newTransaction.tradeRatioD18 = eventArgsCreateTrade.tradeRatio;
};

/**
 * Creates a new Epoch from a given event
 * @param eventArgs The event arguments from the EpochCreated event.
 * @param market The market associated with the epoch.
 * @returns The newly created or updated epoch.
 */
export const createEpochFromEvent = async (
  eventArgs: EpochCreatedEventLog,
  market: Market
) => {
  const epochRepository = dataSource.getRepository(Epoch);
  // first check if there's an existing epoch in the database before creating a new one
  const existingEpoch = await epochRepository.findOne({
    where: {
      epochId: Number(eventArgs.epochId),
      market: { address: market.address, chainId: market.chainId },
    },
  });

  const newEpoch = existingEpoch || new Epoch();
  newEpoch.epochId = Number(eventArgs.epochId);
  newEpoch.market = market;
  newEpoch.startTimestamp = eventArgs.startTime;
  newEpoch.endTimestamp = eventArgs.endTime;
  newEpoch.startingSqrtPriceX96 = eventArgs.startingSqrtPriceX96;
  newEpoch.epochParams = market.epochParams;

  const epoch = await epochRepository.save(newEpoch);
  return epoch;
};