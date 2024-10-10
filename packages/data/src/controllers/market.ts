import "tsconfig-paths/register";
import {
  epochRepository,
  eventRepository,
  initializeDataSource,
  marketRepository,
  transactionRepository,
} from "../db";
import { EpochParams } from "../models/EpochParams";
import { Event } from "../models/Event";
import { Market } from "../models/Market";
import { Transaction, TransactionType } from "../models/Transaction";
import { Abi, decodeEventLog, Log } from "viem";
import { EpochCreatedEventLog, EventType, MarketCreatedUpdatedEventLog, MarketInfo } from "../interfaces";
import { getProviderForChain, bigintReplacer } from "../helpers";
import { createEpochFromEvent, createOrModifyPosition, createOrUpdateMarketFromEvent, handleTransferEvent, updateTransactionFromAddLiquidityEvent, updateTransactionFromLiquidityClosedEvent, updateTransactionFromLiquidityModifiedEvent, updateTransactionFromTradeModifiedEvent, upsertMarketPrice } from "./marketHelpers";

export const initializeMarket = async (marketInfo: MarketInfo) => {
  let existingMarket = await marketRepository.findOne({
    where: {
      address: marketInfo.deployment.address,
      chainId: marketInfo.marketChainId,
    },
  });
  const market = existingMarket || new Market();

  const client = getProviderForChain(marketInfo.marketChainId);

  const marketReadResult: any = await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: marketInfo.deployment.abi,
    functionName: "getMarket",
  });
  console.log("marketReadResult", marketReadResult);

  let updatedMarket = market;
  if (!updatedMarket) {
    let existingMarket = await marketRepository.findOne({
      where: {
        address: marketInfo.deployment.address,
        chainId: marketInfo.marketChainId,
      },
      relations: ["epochs"],
    });
    updatedMarket = existingMarket || new Market();
  }

  updatedMarket.name = marketInfo.name;
  updatedMarket.public = marketInfo.public;
  updatedMarket.address = marketInfo.deployment.address;
  updatedMarket.deployTxnBlockNumber = Number(
    marketInfo.deployment.deployTxnBlockNumber
  );
  updatedMarket.deployTimestamp = Number(marketInfo.deployment.deployTimestamp);
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

export const indexMarketEvents = async (market: Market, abi: Abi) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const chainId = await client.getChainId();

  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const blockNumber = log.blockNumber || 0n;
      const block = await client.getBlock({
        blockNumber,
      });

      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      // Extract epochId from logData (adjust this based on your event structure)
      const epochId = logData.args?.epochId || 0;
      console.log("logData is", logData);

      await upsertEvent(
        chainId,
        market.address,
        epochId,
        blockNumber,
        block.timestamp,
        logIndex,
        logData
      );
    }
  };

  console.log(
    `Watching contract events for ${market.chainId}:${market.address}`
  );
  client.watchContractEvent({
    address: market.address as `0x${string}`,
    abi,
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

export const reindexMarketEvents = async (market: Market, abi: Abi) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);

  const startBlock = market.deployTxnBlockNumber;
  const endBlock = await client.getBlockNumber();
  const chainId = await client.getChainId();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.log("Indexing market events from block ", blockNumber);
    try {
      const logs = await client.getLogs({
        address: market.address as `0x${string}`,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        const decodedLog = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);
        const blockNumber = log.blockNumber;
        const block = await client.getBlock({
          blockNumber: log.blockNumber,
        });
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);

        // Extract epochId from logData (adjust this based on your event structure)
        const epochId = logData.args?.epochId || 0;

        await upsertEvent(
          chainId,
          market.address,
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

const upsertEvent = async (
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: any
) => {
  console.log("handling event upsert:", {
    chainId,
    address,
    epochId,
    blockNumber,
    timeStamp,
    logIndex,
    logData,
  });

  // Find market and/or epoch associated with the event
  let market = await marketRepository.findOne({
    where: { chainId, address },
    relations: ["epochs", "epochs.market"],
  });
  let epoch = market?.epochs.find((e) => e.epochId === epochId);

  switch (logData.eventName) {
    case "MarketInitialized":
      console.log("initializing market. LogData: ", logData);
      const marketCreatedArgs = logData.args as MarketCreatedUpdatedEventLog;
      market = await createOrUpdateMarketFromEvent(
        marketCreatedArgs,
        chainId,
        address,
        market
      );
      break;
    case "MarketUpdated":
      console.log("updating market. LogData: ", logData);
      const marketUpdatedArgs = logData.args as MarketCreatedUpdatedEventLog;
      market = await createOrUpdateMarketFromEvent(
        marketUpdatedArgs,
        chainId,
        address,
        market
      );
      break;
    case "EpochCreated":
      console.log("creating epoch. LogData: ", logData);
      if (!market) {
        throw new Error(
          `Market not found for chainId ${chainId} and address ${address}. Cannot create epoch in db from event.`
        );
      }
      const epochCreatedArgs = logData.args as EpochCreatedEventLog;
      epoch = await createEpochFromEvent(epochCreatedArgs, market);
      break;
    case "MarketSettled":
      console.log("Market settled event. LogData: ", logData);
      if (!epoch) {
        throw new Error(
          `Epoch with id ${epochId} not found for market address ${address} chainId ${chainId}. Cannot update epoch in db from event.`
        );
      }
      epoch.settled = true;
      epoch.settlementPriceD18 = logData.args.settlementPriceD18;
      epoch = await epochRepository.save(epoch);
      break;
    default:
      break;
  }

  // throw if epoch not found/created properly since we need it for the Event
  if (!epoch) {
    throw new Error(
      `Epoch with id ${epochId} not found for market address ${address} chainId ${chainId}. Cannot upsert event into db.`
    );
  }

  console.log("inserting new event..");
  // Create a new Event entity
  const newEvent = new Event();
  newEvent.epoch = epoch;
  newEvent.blockNumber = blockNumber.toString();
  newEvent.timestamp = timeStamp.toString();
  newEvent.logIndex = logIndex;
  newEvent.logData = logData;

  // insert the event
  await eventRepository.upsert(newEvent, ["epoch", "blockNumber", "logIndex"]);
};

export const upsertEntitiesFromEvent = async (event: Event) => {
  const newTransaction = new Transaction();
  newTransaction.event = event;

  // set to true if the Event does not require a transaction (i.e. a Transfer event)
  let skipTransaction = false;

  switch (event.logData.eventName) {
    case EventType.LiquidityPositionCreated:
      console.log("Creating liquidity position from event: ", event);
      updateTransactionFromAddLiquidityEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionClosed:
      console.log("Closing liquidity position from event: ", event);
      newTransaction.type = TransactionType.REMOVE_LIQUIDITY;
      await updateTransactionFromLiquidityClosedEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionDecreased:
      console.log("Decreasing liquidity position from event: ", event);
      await updateTransactionFromLiquidityModifiedEvent(
        newTransaction,
        event,
        true
      );
      break;
    case EventType.LiquidityPositionIncreased:
      console.log("Increasing liquidity position from event: ", event);
      await updateTransactionFromLiquidityModifiedEvent(newTransaction, event);
      break;
    case EventType.TraderPositionCreated:
      console.log("Creating trader position from event: ", event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;
    case EventType.TraderPositionModified:
      console.log("Modifying trader position from event: ", event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;
    case EventType.Transfer:
      console.log("Handling Transfer event: ", event);
      await handleTransferEvent(event);
      skipTransaction = true;
      break;
    default:
      skipTransaction = true;
      break;
  }

  if (!skipTransaction) {
    console.log("Saving new transaction: ", newTransaction);
    await transactionRepository.save(newTransaction);
    await createOrModifyPosition(newTransaction);
    await upsertMarketPrice(newTransaction);
  }
};