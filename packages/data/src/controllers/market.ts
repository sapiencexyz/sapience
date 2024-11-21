import "tsconfig-paths/register";
import {
  epochRepository,
  eventRepository,
  initializeDataSource,
  marketRepository,
  transactionRepository,
} from "../db";
import { MarketParams } from "../models/MarketParams";
import { Event } from "../models/Event";
import { Market } from "../models/Market";
import { Transaction, TransactionType } from "../models/Transaction";
import { Abi, decodeEventLog, Log } from "viem";
import {
  EpochCreatedEventLog,
  EventType,
  MarketCreatedUpdatedEventLog,
  MarketInfo,
} from "../interfaces";
import { getProviderForChain, bigintReplacer } from "../helpers";
import {
  createEpochFromEvent,
  createOrModifyPosition,
  createOrUpdateMarketFromEvent,
  handleTransferEvent,
  handlePositionSettledEvent,
  updateTransactionFromAddLiquidityEvent,
  updateTransactionFromLiquidityClosedEvent,
  updateTransactionFromLiquidityModifiedEvent,
  updateTransactionFromTradeModifiedEvent,
  upsertMarketPrice,
  updateTransactionFromPositionSettledEvent,
} from "./marketHelpers";
import { Client, TextChannel, EmbedBuilder } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const discordClient = new Client({ intents: [] });

// Called when the process starts, upserts markets in the database to match those in the constants.ts file
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
  const marketParamsRaw = marketReadResult[4];
  const marketEpochParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness.toString(),
    bondAmount: marketParamsRaw.bondAmount.toString(),
  };
  updatedMarket.marketParams = marketEpochParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

// Called when the process starts after initialization. Watches events for a given market and calls upsertEvent for each one.
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

      const epochId = logData.args?.epochId || 0;

      await alertEvent(chainId, market.address, epochId, blockNumber, block.timestamp, logData);

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

// Iterates over all blocks from the market's deploy block to the current block and calls upsertEvent for each one.
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
        const logData = {
          ...JSON.parse(serializedLog),
          transactionHash: log.transactionHash || "",
          blockHash: log.blockHash || "",
          blockNumber: log.blockNumber?.toString() || "",
          logIndex: log.logIndex || 0,
          transactionIndex: log.transactionIndex || 0,
          removed: log.removed || false,
          topics: log.topics || [],
          data: log.data || "",
        };

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

const alertEvent = async (
  chainId: number,
  address: string,
  epochId: any,
  blockNumber: bigint,
  timestamp: bigint,
  logData: any
) => {
  try {
    if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID) {
      console.warn('Discord credentials not configured, skipping alert');
      return;
    }

    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID) as TextChannel;
    
    const embed = new EmbedBuilder()
      .setTitle(`New Market Event: ${logData.eventName}`)
      .setColor('#0099ff')
      .addFields(
        { name: 'Chain ID', value: chainId.toString(), inline: true },
        { name: 'Market Address', value: address, inline: true },
        { name: 'Epoch ID', value: epochId.toString(), inline: true },
        { name: 'Block Number', value: blockNumber.toString(), inline: true },
        { name: 'Timestamp', value: new Date(Number(timestamp) * 1000).toISOString(), inline: true }
      )
      .setTimestamp();

    // Add event-specific details if available
    if (logData.args) {
      const argsField = Object.entries(logData.args)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      embed.addFields({ name: 'Event Arguments', value: `\`\`\`${argsField}\`\`\`` });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send Discord alert:', error);
  }
};

// Upserts an event into the database using the proper helper function.
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

  // // Find market and/or epoch associated with the event
  let market = await marketRepository.findOne({
    where: { chainId, address },
  });

  // marketInitialized should handle creating the market, throw if not found
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}. Cannot upsert event into db.`
    );
  }

  console.log("inserting new event..");
  // Create a new Event entity
  const newEvent = new Event();
  newEvent.market = market;
  newEvent.blockNumber = Number(blockNumber);
  newEvent.timestamp = timeStamp.toString();
  newEvent.logIndex = logIndex;
  newEvent.logData = logData;

  // insert the event
  await eventRepository.upsert(newEvent, ["market", "blockNumber", "logIndex"]);
};

// Triggered by the callback in the Event model, this upserts related entities (Transaction, Position, MarketPrice).
export const upsertEntitiesFromEvent = async (event: Event) => {
  const existingTransaction = await transactionRepository.findOne({
    where: { event: { id: event.id } },
  });
  const newTransaction = existingTransaction || new Transaction();
  newTransaction.event = event;

  // set to true if the Event does not require a transaction (i.e. a Transfer event)
  let skipTransaction = false;

  const chainId = event.market.chainId;
  const address = event.market.address;
  const market = event.market;

  switch (event.logData.eventName) {
    case EventType.MarketInitialized:
      console.log("initializing market. event: ", event);
      const marketCreatedArgs = event.logData
        .args as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketCreatedArgs,
        chainId,
        address,
        market
      );
      skipTransaction = true;
      break;
    case EventType.MarketUpdated:
      console.log("updating market. event: ", event);
      const marketUpdatedArgs = event.logData
        .args as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketUpdatedArgs,
        chainId,
        address,
        market
      );
      skipTransaction = true;
      break;
    case EventType.EpochCreated:
      console.log("creating epoch. event: ", event);
      const epochCreatedArgs = event.logData.args as EpochCreatedEventLog;
      await createEpochFromEvent(epochCreatedArgs, market);
      skipTransaction = true;
      break;
    case EventType.EpochSettled:
      console.log("Market settled event. event: ", event);
      const epoch = await epochRepository.findOne({
        where: {
          market: { address, chainId },
          epochId: event.logData.args.epochId,
        },
        relations: ["market"],
      });
      if (epoch) {
        epoch.settled = true;
        epoch.settlementPriceD18 = event.logData.args.settlementPriceD18;
        await epochRepository.save(epoch);
      } else {
        console.error("Epoch not found for market: ", market);
      }
      skipTransaction = true;
      break;
    case EventType.LiquidityPositionCreated:
      console.log("Creating liquidity position from event: ", event);
      updateTransactionFromAddLiquidityEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionClosed:
      console.log("Closing liquidity position from event: ", event);
      newTransaction.type = TransactionType.REMOVE_LIQUIDITY;
      await updateTransactionFromLiquidityClosedEvent(
        newTransaction,
        event,
        event.logData.args.epochId
      );
      break;
    case EventType.LiquidityPositionDecreased:
      console.log("Decreasing liquidity position from event: ", event);
      await updateTransactionFromLiquidityModifiedEvent(
        newTransaction,
        event,
        event.logData.args.epochId,
        true
      );
      break;
    case EventType.LiquidityPositionIncreased:
      console.log("Increasing liquidity position from event: ", event);
      await updateTransactionFromLiquidityModifiedEvent(
        newTransaction,
        event,
        event.logData.args.epochId
      );
      break;
    case EventType.TraderPositionCreated:
      console.log("Creating trader position from event: ", event);
      await updateTransactionFromTradeModifiedEvent(
        newTransaction,
        event,
        event.logData.args.epochId
      );
      break;
    case EventType.TraderPositionModified:
      console.log("Modifying trader position from event: ", event);
      await updateTransactionFromTradeModifiedEvent(
        newTransaction,
        event,
        event.logData.args.epochId
      );
      break;
    case EventType.PositionSettled:
      console.log("Handling Position Settled from event: ", event);
      await Promise.all([
        handlePositionSettledEvent(event),
        updateTransactionFromPositionSettledEvent(
          newTransaction,
          event,
          event.logData.args.epochId
        ),
      ]);
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

