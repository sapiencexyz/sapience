/* eslint-disable @typescript-eslint/no-explicit-any */
import 'tsconfig-paths/register';
import {
  epochRepository,
  eventRepository,
  initializeDataSource,
  marketRepository,
  transactionRepository,
} from '../db';
import { MarketParams } from '../models/MarketParams';
import { Event } from '../models/Event';
import { Market } from '../models/Market';
import { Transaction } from '../models/Transaction';
import { decodeEventLog, Log, formatUnits } from 'viem';
import {
  EpochCreatedEventLog,
  EventType,
  MarketCreatedUpdatedEventLog,
} from '../interfaces';
import {
  getProviderForChain,
  bigintReplacer,
  sqrtPriceX96ToSettlementPriceD18,
  getBlockByTimestamp,
} from '../utils';
import {
  createEpochFromEvent,
  createOrUpdateMarketFromEvent,
  createOrModifyPositionFromTransaction,
  handleTransferEvent,
  handlePositionSettledEvent,
  updateTransactionFromAddLiquidityEvent,
  updateTransactionFromLiquidityClosedEvent,
  updateTransactionFromLiquidityModifiedEvent,
  updateTransactionFromTradeModifiedEvent,
  insertMarketPrice,
  updateTransactionFromPositionSettledEvent,
  insertCollateralTransfer,
  createOrUpdateEpochFromContract,
} from './marketHelpers';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import * as Chains from 'viem/chains';
import Foil from '@foil/protocol/deployments/Foil.json';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_PRIVATE_CHANNEL_ID = process.env.DISCORD_PRIVATE_CHANNEL_ID;
const DISCORD_PUBLIC_CHANNEL_ID = process.env.DISCORD_PUBLIC_CHANNEL_ID;
const discordClient = new Client({ intents: [] });

if (DISCORD_TOKEN) {
  discordClient.login(DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login to Discord:', error);
  });
}

interface LogData {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: number;
  removed: boolean;
  topics: string[];
  transactionIndex: number;
}

// Define the MarketInfo interface
interface MarketInfo {
  marketChainId: number;
  deployment: {
    address: string;
    deployTxnBlockNumber?: string | number | null;
    deployTimestamp?: string | number | null;
  };
  resource: {
    id?: number | string;
    slug?: string;
    priceIndexer: {
      client?: any;
      indexBlocks: (resource: any, blockNumbers: number[]) => Promise<any>;
    };
    [key: string]: any;
  };
  vaultAddress?: string;
  isYin?: boolean;
  isCumulative?: boolean;
}

// Called when the process starts, upserts markets in the database to match those in the constants.ts file
export const initializeMarket = async (marketInfo: MarketInfo) => {
  const existingMarket = await marketRepository.findOne({
    where: {
      address: marketInfo.deployment.address.toLowerCase(),
      chainId: marketInfo.marketChainId,
    },
    relations: ['resource'],
  });
  const market = existingMarket || new Market();

  const client = getProviderForChain(marketInfo.marketChainId);

  const marketReadResult = (await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: Foil.abi,
    functionName: 'getMarket',
  })) as [string, string, boolean, boolean, MarketParams];

  const updatedMarket = market;

  updatedMarket.address = marketInfo.deployment.address.toLowerCase();
  updatedMarket.vaultAddress = marketInfo.vaultAddress ?? '';
  updatedMarket.isYin = marketInfo.isYin ?? true;
  updatedMarket.isCumulative = marketInfo.isCumulative ?? false;
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
    assertionLiveness: marketParamsRaw?.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw?.bondAmount?.toString() ?? '0',
  };
  updatedMarket.marketParams = marketEpochParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

// Called when the process starts after initialization. Watches events for a given market and calls upsertEvent for each one.
export const indexMarketEvents = async (market: Market) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const chainId = await client.getChainId();

  const processLogs = async (logs: Log[]) => {
    console.log(
      '[MarketIndexer]',
      `Processing logs for market ${market.chainId}:${market.address}`
    );
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const blockNumber = log.blockNumber || 0n;
      const block = await client.getBlock({
        blockNumber,
      });

      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      const epochId = logData.args?.epochId || 0;

      await alertEvent(
        chainId,
        market.address,
        epochId,
        blockNumber,
        block.timestamp,
        logData
      );

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
    abi: Foil.abi,
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

// Iterates over all blocks from the market's deploy block to the current block and calls upsertEvent for each one.
export const reindexMarketEvents = async (market: Market, epochId: number) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const chainId = await client.getChainId();

  // Get the epoch to calculate the time-based block
  const epoch = await epochRepository.findOne({
    where: {
      market: { id: market.id },
      epochId: Number(epochId),
    },
  });

  if (!epoch) {
    throw new Error(`Epoch ${epochId} not found for market ${market.address}`);
  }

  if (!epoch.startTimestamp || !epoch.endTimestamp) {
    throw new Error(`Epoch ${epochId} is missing start or end timestamp`);
  }

  // Calculate the start time as one epoch period before the epoch's start time
  // An epoch period is defined as (endTimestamp - startTimestamp)
  const epochDuration =
    BigInt(epoch.endTimestamp) - BigInt(epoch.startTimestamp);
  const lookbackStartTime = Number(
    BigInt(epoch.startTimestamp) - epochDuration
  );

  // Get the block number for this lookback start time
  const lookbackStartBlock = await getBlockByTimestamp(
    client,
    lookbackStartTime
  );

  // Use the later of the deployment block or the lookback start block
  const startBlock = Math.max(
    Number(market.deployTxnBlockNumber || 0),
    Number(lookbackStartBlock.number)
  );

  // Get the end block using the sooner of epoch end time and current time
  const currentTime = Math.floor(Date.now() / 1000);
  const endTime = Math.min(Number(epoch.endTimestamp), currentTime);

  let endBlock;
  try {
    endBlock = await getBlockByTimestamp(client, endTime);
  } catch (err) {
    const error = err as Error;
    console.error(
      `Failed to get end block for timestamp ${endTime}: ${error.message}`
    );
    console.log(`Using current block as fallback`);
    try {
      const latestBlockNumber = await client.getBlockNumber();
      endBlock = await client.getBlock({ blockNumber: latestBlockNumber });
      console.log(
        `Successfully retrieved current block ${latestBlockNumber} as fallback`
      );
    } catch (fbErr) {
      const fallbackError = fbErr as Error;
      console.error(
        `Failed to get latest block as fallback: ${fallbackError.message}`
      );
      throw new Error(
        `Could not determine end block for reindexing: ${error.message}`
      );
    }
  }

  const CHUNK_SIZE = 10000; // Process 10,000 blocks at a time

  console.log(
    `Reindexing market events for epoch ${epochId} from block ${startBlock} to ${endBlock.number}`
  );

  // Function to process logs regardless of how they were fetched
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      try {
        const decodedLog = decodeEventLog({
          abi: Foil.abi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);
        const logBlockNumber = log.blockNumber || 0n;
        const block = await client.getBlock({ blockNumber: logBlockNumber });
        const logIndex = log.logIndex || 0;
        const logData = {
          ...JSON.parse(serializedLog),
          transactionHash: log.transactionHash || '',
          blockHash: log.blockHash || '',
          blockNumber: logBlockNumber.toString(),
          logIndex,
          transactionIndex: log.transactionIndex || 0,
          removed: log.removed || false,
          topics: log.topics || [],
          data: log.data || '',
        };

        // Extract epochId from logData
        const eventEpochId = logData.args?.epochId || 0;

        await upsertEvent(
          chainId,
          market.address,
          eventEpochId,
          logBlockNumber,
          block.timestamp,
          logIndex,
          logData
        );
      } catch (error) {
        console.error(
          `Error processing log at block ${log.blockNumber || 'unknown'}:`,
          error
        );
      }
    }
  };

  // Process blocks in chunks to avoid RPC limitations
  let currentBlock = startBlock;
  let totalLogsProcessed = 0;

  while (currentBlock <= Number(endBlock.number ?? BigInt(currentBlock))) {
    const chunkEndBlock = Math.min(
      currentBlock + CHUNK_SIZE - 1,
      Number(endBlock.number ?? BigInt(currentBlock))
    );

    try {
      console.log(
        `Fetching logs for blocks ${currentBlock} to ${chunkEndBlock}`
      );
      const logs = await client.getLogs({
        address: market.address as `0x${string}`,
        fromBlock: BigInt(currentBlock),
        toBlock: BigInt(chunkEndBlock),
      });

      if (logs.length > 0) {
        console.log(
          `Found ${logs.length} logs in blocks ${currentBlock}-${chunkEndBlock}`
        );
        await processLogs(logs);
        totalLogsProcessed += logs.length;
      }

      // Move to the next chunk
      currentBlock = chunkEndBlock + 1;
    } catch (error) {
      console.error(
        `Error fetching logs for block range ${currentBlock}-${chunkEndBlock}:`,
        error
      );

      // If a chunk fails, fall back to processing that chunk block by block
      console.log(
        `Falling back to block-by-block indexing for range ${currentBlock}-${chunkEndBlock}`
      );
      for (
        let blockNumber = currentBlock;
        blockNumber <= chunkEndBlock;
        blockNumber++
      ) {
        try {
          const logs = await client.getLogs({
            address: market.address as `0x${string}`,
            fromBlock: BigInt(blockNumber),
            toBlock: BigInt(blockNumber),
          });

          if (logs.length > 0) {
            console.log(
              `Processing ${logs.length} logs from block ${blockNumber}`
            );
            await processLogs(logs);
            totalLogsProcessed += logs.length;
          }
        } catch (error) {
          console.error(`Error processing block ${blockNumber}:`, error);
        }
      }

      // Move to the next chunk
      currentBlock = chunkEndBlock + 1;
    }
  }

  console.log(
    `Completed indexing for market ${market.address} in epoch ${epochId}. Processed ${totalLogsProcessed} logs.`
  );
};

const alertEvent = async (
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: bigint,
  timestamp: bigint,
  logData: LogData
) => {
  try {
    if (!DISCORD_TOKEN) {
      console.warn('Discord credentials not configured, skipping alert');
      return;
    }

    // Add check for client readiness
    if (!discordClient.isReady()) {
      console.warn('Discord client not ready, skipping alert');
      return;
    }

    if (DISCORD_PUBLIC_CHANNEL_ID && logData.eventName !== EventType.Transfer) {
      const publicChannel = (await discordClient.channels.fetch(
        DISCORD_PUBLIC_CHANNEL_ID
      )) as TextChannel;

      let title = '';

      // Format based on event type
      switch (logData.eventName) {
        case EventType.TraderPositionCreated:
        case EventType.TraderPositionModified: {
          const tradeDirection =
            BigInt(String(logData.args.finalPrice)) >
            BigInt(String(logData.args.initialPrice))
              ? 'Long'
              : 'Short';
          const gasAmount = formatUnits(
            BigInt(
              String(
                logData.args.positionVgasAmount ||
                  logData.args.positionBorrowedVgas
              )
            ),
            18
          ); // returns string
          const rawPriceGwei = Number(logData.args.tradeRatio) / 1e18;
          const priceGwei = rawPriceGwei.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          });

          title = `${tradeDirection === 'Long' ? '<:pepegas:1313887905508364288>' : '<:peepoangry:1313887206687117313>'} **Trade Executed:** ${tradeDirection} ${gasAmount} Ggas @ ${priceGwei} wstGwei`;
          break;
        }

        case EventType.LiquidityPositionCreated:
        case EventType.LiquidityPositionIncreased:
        case EventType.LiquidityPositionDecreased:
        case EventType.LiquidityPositionClosed: {
          const action =
            logData.eventName === EventType.LiquidityPositionDecreased ||
            logData.eventName === EventType.LiquidityPositionClosed
              ? 'Removed'
              : 'Added';
          const liquidityGas = formatUnits(
            BigInt(
              String(
                logData.args.addedAmount0 ||
                  logData.args.increasedAmount0 ||
                  logData.args.amount0
              )
            ),
            18
          ); // returns string
          let priceRangeText = '';
          if (
            logData.args.lowerTick !== undefined &&
            logData.args.upperTick !== undefined
          ) {
            const rawLowerPrice = Math.pow(
              1.0001,
              Number(logData.args.lowerTick)
            );
            const rawUpperPrice = Math.pow(
              1.0001,
              Number(logData.args.upperTick)
            );

            const lowerPrice = rawLowerPrice.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });
            const upperPrice = rawUpperPrice.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });

            priceRangeText = ` from ${lowerPrice} - ${upperPrice} wstGwei`;
          }

          title = `<:pepeliquid:1313887190056439859> **Liquidity Modified:** ${action} ${liquidityGas} Ggas${priceRangeText}`;
          break;
        }
        default:
          return; // Skip other events
      }

      // Get block explorer URL based on chain ID
      const getBlockExplorerUrl = (chainId: number, txHash: string) => {
        const chain = Object.values(Chains).find((c) => c.id === chainId);
        return chain?.blockExplorers?.default?.url
          ? `${chain.blockExplorers.default.url}/tx/${txHash}`
          : `https://etherscan.io/tx/${txHash}`;
      };

      let marketName = 'Foil Market';
      try {
        const marketObj = await marketRepository.findOne({
          where: { address, chainId },
          relations: ['resource'],
        });

        if (marketObj && marketObj.resource && marketObj.resource.name) {
          marketName = marketObj.resource.name;
        }
      } catch (error) {
        console.error('Failed to fetch market name from database:', error);
      }

      const embed = new EmbedBuilder()
        .setColor('#2b2b2e')
        .addFields(
          {
            name: 'Market',
            value: `${marketName} (Epoch ${epochId.toString()})`,
            inline: true,
          },
          {
            name: 'Position',
            value: String(logData.args.positionId),
            inline: true,
          },
          {
            name: 'Account',
            value: String(logData.args.sender),
          },
          {
            name: 'Transaction',
            value: getBlockExplorerUrl(chainId, logData.transactionHash),
          }
        )
        .setTimestamp();

      await publicChannel.send({ content: title, embeds: [embed] });
    }

    if (DISCORD_PRIVATE_CHANNEL_ID) {
      const privateChannel = (await discordClient.channels.fetch(
        DISCORD_PRIVATE_CHANNEL_ID
      )) as TextChannel;

      const embed = new EmbedBuilder()
        .setTitle(`New Market Event: ${logData.eventName}`)
        .setColor('#2b2b2e')
        .addFields(
          { name: 'Chain ID', value: chainId.toString(), inline: true },
          { name: 'Market Address', value: address, inline: true },
          { name: 'Epoch ID', value: epochId.toString(), inline: true },
          { name: 'Block Number', value: blockNumber.toString(), inline: true },
          {
            name: 'Timestamp',
            value: new Date(Number(timestamp) * 1000).toISOString(),
            inline: true,
          }
        )
        .setTimestamp();

      // Add event-specific details if available
      if (logData.args) {
        const argsField = Object.entries(logData.args)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        embed.addFields({
          name: 'Event Arguments',
          value: `\`\`\`${argsField}\`\`\``,
        });
      }

      await privateChannel.send({ embeds: [embed] });
    }
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
  logData: LogData
) => {
  console.log('handling event upsert:', {
    chainId,
    address,
    epochId,
    blockNumber,
    timeStamp,
    logIndex,
    logData,
  });

  // Find market with relations
  const market = await marketRepository.findOne({
    where: { chainId, address },
    relations: ['marketParams'],
  });

  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}. Cannot upsert event into db.`
    );
  }

  try {
    // Check if event already exists
    const existingEvent = await eventRepository.findOne({
      where: {
        transactionHash: logData.transactionHash,
        market: { id: market.id },
        blockNumber: Number(blockNumber),
        logIndex: logIndex,
      },
      relations: ['market'],
    });

    if (existingEvent) {
      console.log('Event already exists, processing existing event');
      // Update the existing event with any new data to avoid UpdateValuesMissingError
      existingEvent.timestamp = timeStamp.toString();
      existingEvent.logData = logData;
      await eventRepository.save(existingEvent);
      await upsertEntitiesFromEvent(existingEvent);
      return existingEvent;
    }

    console.log('inserting new event..');
    const newEvent = new Event();
    newEvent.market = market;
    newEvent.blockNumber = Number(blockNumber);
    newEvent.timestamp = timeStamp.toString();
    newEvent.logIndex = logIndex;
    newEvent.logData = logData;
    newEvent.transactionHash = logData.transactionHash;

    const savedEvent = await eventRepository.save(newEvent);

    // Reload the event with all necessary relations
    const loadedEvent = await eventRepository.findOne({
      where: { id: savedEvent.id },
      relations: ['market'],
    });

    if (!loadedEvent) {
      throw new Error(`Failed to load saved event with ID ${savedEvent.id}`);
    }

    await upsertEntitiesFromEvent(loadedEvent);
    return loadedEvent;
  } catch (error) {
    console.error('Error upserting event:', error);
    throw error;
  }
};
// Triggered by the callback in the Event model, this upserts related entities (Transaction, Position, MarketPrice).
export const upsertEntitiesFromEvent = async (event: Event) => {
  // First check if this event has already been processed by looking for an existing transaction
  const existingTransaction = await transactionRepository.findOne({
    where: { event: { id: event.id } },
  });

  if (existingTransaction) {
    console.log(`Event ${event.id} has already been processed, skipping`);
    return;
  }

  let skipTransaction = false;
  const newTransaction = new Transaction();
  newTransaction.event = event;

  // Process the event based on its type
  switch (event.logData.eventName) {
    // Market events
    case EventType.MarketInitialized: {
      console.log('initializing market. event: ', event);
      const marketCreatedArgs = {
        uniswapPositionManager: event.logData.args.uniswapPositionManager,
        uniswapSwapRouter: event.logData.args.uniswapSwapRouter,
        optimisticOracleV3: event.logData.args.optimisticOracleV3,
        marketParams: event.logData.args.marketParams,
      } as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketCreatedArgs,
        event.market.chainId,
        event.market.address,
        event.market
      );
      skipTransaction = true;
      break;
    }
    case EventType.MarketUpdated: {
      console.log('updating market. event: ', event);
      const marketUpdatedArgs = {
        uniswapPositionManager: event.logData.args.uniswapPositionManager,
        uniswapSwapRouter: event.logData.args.uniswapSwapRouter,
        optimisticOracleV3: event.logData.args.optimisticOracleV3,
        marketParams: event.logData.args.marketParams,
      } as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketUpdatedArgs,
        event.market.chainId,
        event.market.address,
        event.market
      );
      skipTransaction = true;
      break;
    }

    // Epoch events
    case EventType.EpochCreated: {
      console.log('creating epoch. event: ', event);
      const epochCreatedArgs = {
        epochId: event.logData.args.epochId,
        startTime: event.logData.args.startTime,
        endTime: event.logData.args.endTime,
        startingSqrtPriceX96: event.logData.args.startingSqrtPriceX96,
      } as EpochCreatedEventLog;
      await createEpochFromEvent(epochCreatedArgs, event.market);

      // Call createOrUpdateEpochFromContract with the data from the event
      await createOrUpdateEpochFromContract(
        event.market,
        Number(epochCreatedArgs.epochId)
      );
      skipTransaction = true;
      break;
    }
    case EventType.EpochSettled: {
      console.log('Market settled event. event: ', event);
      const epoch = await epochRepository.findOne({
        where: {
          market: {
            address: event.market.address.toLowerCase(),
            chainId: event.market.chainId,
          },
          epochId: Number(event.logData.args.epochId),
        },
        relations: ['market'],
      });
      if (epoch) {
        epoch.settled = true;
        const settlementSqrtPriceX96: bigint = BigInt(
          (event.logData.args.settlementSqrtPriceX96 as string)?.toString() ??
            '0'
        );
        const settlementPriceD18 = sqrtPriceX96ToSettlementPriceD18(
          settlementSqrtPriceX96
        );
        epoch.settlementPriceD18 = settlementPriceD18.toString();
        await epochRepository.save(epoch);
      } else {
        console.error('Epoch not found for market: ', event.market);
      }
      skipTransaction = true;
      break;
    }

    // Position events
    case EventType.Transfer:
      console.log('Handling Transfer event: ', event);
      await handleTransferEvent(event);
      skipTransaction = true;
      break;
    case EventType.PositionSettled:
      console.log('Handling Position Settled from event: ', event);
      await Promise.all([
        handlePositionSettledEvent(event),
        updateTransactionFromPositionSettledEvent(newTransaction, event),
      ]);
      break;

    // Liquidity events
    case EventType.LiquidityPositionCreated:
      console.log('Creating liquidity position from event: ', event);
      updateTransactionFromAddLiquidityEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionClosed:
      console.log('Closing liquidity position from event: ', event);
      await updateTransactionFromLiquidityClosedEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionDecreased:
      console.log('Decreasing liquidity position from event: ', event);
      await updateTransactionFromLiquidityModifiedEvent(
        newTransaction,
        event,
        true
      );
      break;
    case EventType.LiquidityPositionIncreased:
      console.log('Increasing liquidity position from event: ', event);
      await updateTransactionFromLiquidityModifiedEvent(newTransaction, event);
      break;

    // Trader events
    case EventType.TraderPositionCreated:
      console.log('Creating trader position from event: ', event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;
    case EventType.TraderPositionModified:
      console.log('Modifying trader position from event: ', event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;

    default:
      skipTransaction = true;
      break;
  }

  if (!skipTransaction) {
    try {
      // Fill transaction with collateral transfer and market price
      await insertCollateralTransfer(newTransaction);
      await insertMarketPrice(newTransaction);

      // Ensure collateral is set to a default value if not present
      if (!newTransaction.collateral || newTransaction.collateral === '') {
        newTransaction.collateral = '0';
      }

      // Ensure all required fields have values to prevent UpdateValuesMissingError
      if (!newTransaction.baseToken) newTransaction.baseToken = '0';
      if (!newTransaction.quoteToken) newTransaction.quoteToken = '0';
      if (!newTransaction.borrowedBaseToken)
        newTransaction.borrowedBaseToken = '0';
      if (!newTransaction.borrowedQuoteToken)
        newTransaction.borrowedQuoteToken = '0';
      if (!newTransaction.tradeRatioD18) newTransaction.tradeRatioD18 = '0';

      // Save the transaction
      console.log('Saving new transaction: ', newTransaction);
      await transactionRepository.save(newTransaction);

      // Then create or modify the position with the saved transaction
      try {
        await createOrModifyPositionFromTransaction(newTransaction);
      } catch (positionError) {
        console.error('Error creating or modifying position:', positionError);
      }
    } catch (error) {
      console.error('Error processing event:', error);
      // If it's a duplicate key error, just log and continue
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        console.warn(
          'Duplicate key error - this event may have already been processed'
        );
        return;
      }
      throw error;
    }
  }
};
