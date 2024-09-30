import "tsconfig-paths/register";
import dataSource, { initializeDataSource } from "../db";
import { Event } from "../entity/Event";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { Abi, decodeEventLog, Log, PublicClient } from "viem";
import { Repository } from "typeorm";
import {
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
} from "../interfaces/interfaces";
import { createEpochFromEvent } from "../util/eventUtil";

const bigintReplacer = (key: string, value: any) => {
  if (typeof value === "bigint") {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const indexMarketEvents = async (
  publicClient: PublicClient,
  Foil: { address: string; abi: Abi }
) => {
  await initializeDataSource();
  const eventRepository = dataSource.getRepository(Event);
  const marketRepository = dataSource.getRepository(Market);
  const epochRepository = dataSource.getRepository(Epoch);
  const chainId = await publicClient.getChainId();

  // Ensure the market exists
  let market = await marketRepository.findOne({
    where: { chainId, address: Foil.address },
  });
  if (!market) {
    // create market
    market = new Market();
    market.chainId = chainId;
    market.address = Foil.address;
    await marketRepository.save(market);
  }

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

      await handleEventUpsert(
        eventRepository,
        marketRepository,
        epochRepository,
        chainId,
        Foil.address,
        epochId,
        blockNumber,
        block.timestamp,
        logIndex,
        logData
      );
    }
  };

  // Start watching for new events
  console.log(`Watching contract events for ${Foil.address}`);
  publicClient.watchContractEvent({
    address: Foil.address as `0x${string}`,
    abi: Foil.abi,
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

export const indexMarketEventsRange = async (
  publicClient: PublicClient,
  start: number,
  end: number,
  contractAddress: string,
  contractAbi: Abi
) => {
  await initializeDataSource();
  const eventRepository = dataSource.getRepository(Event);
  const marketRepository = dataSource.getRepository(Market);
  const epochRepository = dataSource.getRepository(Epoch);
  const chainId = await publicClient.getChainId();

  // Ensure the market exists
  let market = await marketRepository.findOne({
    where: { chainId, address: contractAddress },
  });
  if (!market) {
    market = new Market();
    market.chainId = chainId;
    market.address = contractAddress;
    await marketRepository.save(market);
  }

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
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

        await handleEventUpsert(
          eventRepository,
          marketRepository,
          epochRepository,
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

const handleEventUpsert = async (
  eventRepository: Repository<Event>,
  marketRepository: Repository<Market>,
  epochRepository: Repository<Epoch>,
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
      address
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
  originalMarket?: Market
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
