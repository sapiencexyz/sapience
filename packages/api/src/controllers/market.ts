/* eslint-disable @typescript-eslint/no-explicit-any */
import 'tsconfig-paths/register';
import prisma from '../db';
import { decodeEventLog, Log } from 'viem';
import {
  MarketCreatedEventLog,
  EventType,
  MarketGroupCreatedUpdatedEventLog,
  LogData,
  marketInfo,
} from '../interfaces';
import {
  getProviderForChain,
  bigintReplacer,
  sqrtPriceX96ToSettlementPriceD18,
  getBlockByTimestamp,
  getContractCreationBlock,
} from '../utils/utils';
import {
  createMarketFromEvent,
  createOrUpdateMarketGroupFromEvent,
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
  createOrUpdateMarketFromContract,
  updateCollateralData,
} from './marketHelpers';
import { alertEvent } from '../workers/discordBot';
import Sapience from '@sapience/protocol/deployments/Sapience.json';
import { PublicClient } from 'viem';
import Sentry from '../instrument';
import { Transaction } from '../../generated/prisma';
import { fetchRenderServices, createRenderJob } from '../utils/utils';
import { reindexAccuracy } from '../workers/jobs/reindexAccuracy';

const settledPositions: any[] = [];
// Called when the process starts, upserts markets in the database to match those in the constants.ts file
export const initializeMarket = async (marketInfo: marketInfo) => {
  const client = getProviderForChain(marketInfo.marketChainId);

  const marketReadResult = (await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: Sapience.abi,
    functionName: 'getMarketGroup',
  })) as [string, string, any];

  const marketParams = {
    feeRate: marketReadResult[2].feeRate,
    assertionLiveness: BigInt(marketReadResult[2].assertionLiveness).toString(),
    bondAmount: BigInt(marketReadResult[2].bondAmount).toString(),
    bondCurrency: marketReadResult[2].bondCurrency,
    uniswapPositionManager: marketReadResult[2].uniswapPositionManager,
    uniswapSwapRouter: marketReadResult[2].uniswapSwapRouter,
    uniswapQuoter: marketReadResult[2].uniswapQuoter,
    optimisticOracleV3: marketReadResult[2].optimisticOracleV3,
  };

  const updatedMarketData = {
    address: marketInfo.deployment.address.toLowerCase(),
    isCumulative: marketInfo.isCumulative ?? false,
    isBridged: marketInfo.isBridged ?? false,
    deployTxnBlockNumber: Number(marketInfo.deployment.deployTxnBlockNumber),
    deployTimestamp: Number(marketInfo.deployment.deployTimestamp),
    chainId: marketInfo.marketChainId,
    owner: marketReadResult[0].toLowerCase(),
    collateralAsset: marketReadResult[1],
    collateralDecimals: null as number | null,
    marketParamsFeerate: marketParams.feeRate as number | null,
    marketParamsAssertionliveness: marketParams.assertionLiveness as
      | string
      | null,
    marketParamsBondcurrency: marketParams.bondCurrency as string | null,
    marketParamsBondamount: marketParams.bondAmount as string | null,
    marketParamsUniswappositionmanager: marketParams.uniswapPositionManager as
      | string
      | null,
    marketParamsUniswapswaprouter: marketParams.uniswapSwapRouter as
      | string
      | null,
    marketParamsUniswapquoter: marketParams.uniswapQuoter as string | null,
    marketParamsOptimisticoraclev3: marketParams.optimisticOracleV3 as
      | string
      | null,
  };

  if (updatedMarketData.collateralAsset) {
    try {
      const decimals = await client.readContract({
        address: updatedMarketData.collateralAsset as `0x${string}`,
        abi: [
          {
            constant: true,
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            payable: false,
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'decimals',
      });
      updatedMarketData.collateralDecimals = Number(decimals);
    } catch (error) {
      console.error(
        `Failed to fetch decimals for token ${updatedMarketData.collateralAsset}:`,
        error
      );
    }
  }

  const marketParamsRaw = marketReadResult[2];
  if (marketParamsRaw) {
    updatedMarketData.marketParamsFeerate = marketParamsRaw.feeRate || null;
    updatedMarketData.marketParamsAssertionliveness =
      marketParamsRaw.assertionLiveness?.toString() || null;
    updatedMarketData.marketParamsBondcurrency =
      marketParamsRaw.bondCurrency || null;
    updatedMarketData.marketParamsBondamount =
      marketParamsRaw.bondAmount?.toString() || null;
    updatedMarketData.marketParamsUniswappositionmanager =
      marketParamsRaw.uniswapPositionManager || null;
    updatedMarketData.marketParamsUniswapswaprouter =
      marketParamsRaw.uniswapSwapRouter || null;
    updatedMarketData.marketParamsUniswapquoter =
      marketParamsRaw.uniswapQuoter || null;
    updatedMarketData.marketParamsOptimisticoraclev3 =
      marketParamsRaw.optimisticOracleV3 || null;
  }

  const updatedMarket = await prisma.marketGroup.upsert({
    where: {
      address_chainId: {
        address: updatedMarketData.address,
        chainId: updatedMarketData.chainId,
      },
    },
    update: updatedMarketData,
    create: updatedMarketData,
    include: { resource: true },
  });

  return updatedMarket;
};

// Called when the process starts after initialization. Watches events for a given market and calls upsertEvent for each one.

/**
 * Extract only the market_group table fields from a market group object, excluding relations
 */
const extractMarketGroupFields = (marketGroup: any) => {
  return {
    address: marketGroup.address,
    chainId: marketGroup.chainId,
    deployTimestamp: marketGroup.deployTimestamp,
    deployTxnBlockNumber: marketGroup.deployTxnBlockNumber,
    owner: marketGroup.owner,
    collateralAsset: marketGroup.collateralAsset,
    resourceId: marketGroup.resourceId,
    marketParamsFeerate: marketGroup.marketParamsFeerate,
    marketParamsAssertionliveness: marketGroup.marketParamsAssertionliveness,
    marketParamsBondcurrency: marketGroup.marketParamsBondcurrency,
    marketParamsBondamount: marketGroup.marketParamsBondamount,
    marketParamsUniswappositionmanager:
      marketGroup.marketParamsUniswappositionmanager,
    marketParamsUniswapswaprouter: marketGroup.marketParamsUniswapswaprouter,
    marketParamsUniswapquoter: marketGroup.marketParamsUniswapquoter,
    marketParamsOptimisticoraclev3: marketGroup.marketParamsOptimisticoraclev3,
    isCumulative: marketGroup.isCumulative,
    isBridged: marketGroup.isBridged,
    categoryId: marketGroup.categoryId,
    question: marketGroup.question,
    baseTokenName: marketGroup.baseTokenName,
    quoteTokenName: marketGroup.quoteTokenName,
    collateralDecimals: marketGroup.collateralDecimals,
    collateralSymbol: marketGroup.collateralSymbol,
    initializationNonce: marketGroup.initializationNonce,
    factoryAddress: marketGroup.factoryAddress,
    minTradeSize: marketGroup.minTradeSize,
  };
};

export const indexMarketGroupEvents = async (
  marketGroup: any, // Using any for now since this depends on helper functions
  client: PublicClient
): Promise<() => void> => {
  const chainId = await client.getChainId();

  try {
    await updateCollateralData(client, marketGroup);
    await prisma.marketGroup.update({
      where: { id: marketGroup.id },
      data: extractMarketGroupFields(marketGroup),
    });
  } catch (err) {
    console.error(
      `Failed to update collateral data for market group ${marketGroup.address}:`,
      err
    );
  }

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 5000;
  let reconnectAttempts = 0;
  let currentUnwatch: (() => void) | null = null;
  let isActive = true; // To allow permanent stop

  const descriptiveName = `market group ${marketGroup.address} on chain ${chainId}`;

  const processLogs = async (logs: Log[]) => {
    console.log(
      `[MarketEventWatcher] Processing ${logs.length} logs for ${descriptiveName}`
    );
    for (const log of logs) {
      try {
        const serializedLog = JSON.stringify(log, bigintReplacer);
        const blockNumber = log.blockNumber || 0n;
        const block = await client.getBlock({
          blockNumber,
        });
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);
        const marketId = logData.args?.marketId || 0;

        console.log(
          `[MarketEventWatcher] 1. Before alertEvent - nostradamus, eventName: ${logData.eventName}, blockNumber: ${blockNumber}, marketGroup: ${marketGroup.address}, marketId: ${marketId}, sender: ${logData.args?.sender || 'N/A'}`
        );
        await alertEvent(chainId, marketGroup.address, logData);
        console.log(
          `[MarketEventWatcher] 2. After alertEvent - nostradamus, eventName: ${logData.eventName}, blockNumber: ${blockNumber}, marketGroup: ${marketGroup.address}, marketId: ${marketId}, sender: ${logData.args?.sender || 'N/A'}`
        );

        console.log(
          `[MarketEventWatcher] 3. Before upsertEvent - nostradamus, eventName: ${logData.eventName}, blockNumber: ${blockNumber}, marketGroup: ${marketGroup.address}, marketId: ${marketId}, sender: ${logData.args?.sender || 'N/A'}`
        );
        await upsertEvent(
          chainId,
          marketGroup.address,
          marketId,
          blockNumber,
          block.timestamp,
          logIndex,
          logData
        );
        console.log(
          `[MarketEventWatcher] 4. After upsertEvent - nostradamus, eventName: ${logData.eventName}, blockNumber: ${blockNumber}, marketGroup: ${marketGroup.address}, marketId: ${marketId}, sender: ${logData.args?.sender || 'N/A'}`
        );
        // Reset reconnect attempts on successful processing of a log entry
        // Potentially, we might want to reset only if all logs in the batch are processed successfully.
        // For now, resetting on any successful log processing to mimic evmIndexer's onBlock success.
        reconnectAttempts = 0;
      } catch (error) {
        console.error(
          `[MarketEventWatcher] Error processing a log for ${descriptiveName}:`,
          error,
          log
        );
        Sentry.withScope((scope) => {
          scope.setExtra('marketAddress', marketGroup.address);
          scope.setExtra('chainId', chainId);
          scope.setExtra('log', log);
          Sentry.captureException(error);
        });
        // Decide if one failed log processing should stop the watcher or trigger reconnect for the whole watcher.
        // For now, it continues processing other logs in the batch and doesn't trigger a reconnect for the watcher itself here.
      }
    }
  };

  const startMarketGroupWatcher = () => {
    if (!isActive) {
      console.log(
        `[MarketEventWatcher] Watcher for ${descriptiveName} is permanently stopped. Not restarting.`
      );
      return;
    }

    console.log(
      `[MarketEventWatcher] Setting up contract event watcher for ${descriptiveName}`
    );

    try {
      currentUnwatch = client.watchContractEvent({
        address: marketGroup.address as `0x${string}`,
        abi: Sapience.abi,
        onLogs: processLogs,
        onError: (error) => {
          console.error(
            `[MarketEventWatcher] Error watching ${descriptiveName}:`,
            error
          );
          Sentry.withScope((scope) => {
            scope.setExtra('marketAddress', marketGroup.address);
            scope.setExtra('chainId', chainId);
            Sentry.captureException(error);
          });

          if (currentUnwatch) {
            currentUnwatch();
            currentUnwatch = null;
          }

          if (!isActive) {
            console.log(
              `[MarketEventWatcher] Watcher for ${descriptiveName} permanently stopped during error handling.`
            );
            return;
          }

          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay =
              RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1); // Exponential backoff
            console.log(
              `[MarketEventWatcher] Attempting to reconnect for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`
            );
            setTimeout(() => {
              startMarketGroupWatcher();
            }, delay);
          } else {
            console.error(
              `[MarketEventWatcher] Max reconnection attempts reached for ${descriptiveName}. Stopping watch.`
            );
            Sentry.captureMessage(
              `[MarketEventWatcher] Max reconnection attempts reached for ${descriptiveName}`
            );
            isActive = false; // Stop trying if max attempts reached
          }
        },
      });
      console.log(
        `[MarketEventWatcher] Watcher setup complete for ${descriptiveName}`
      );
    } catch (error) {
      console.error(
        `[MarketEventWatcher] Critical error setting up watcher for ${descriptiveName}:`,
        error
      );
      Sentry.withScope((scope) => {
        scope.setExtra('marketAddress', marketGroup.address);
        scope.setExtra('chainId', chainId);
        Sentry.captureException(error);
      });

      if (!isActive) return;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
        console.log(
          `[MarketEventWatcher] Attempting to reconnect (after setup error) for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`
        );
        setTimeout(() => {
          startMarketGroupWatcher();
        }, delay);
      } else {
        console.error(
          `[MarketEventWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}. Stopping.`
        );
        Sentry.captureMessage(
          `[MarketEventWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}`
        );
        isActive = false;
      }
    }
  };

  startMarketGroupWatcher();

  return () => {
    console.log(
      `[MarketEventWatcher] Permanently stopping watcher for ${descriptiveName}.`
    );
    isActive = false;
    if (currentUnwatch) {
      try {
        currentUnwatch();
        console.log(
          `[MarketEventWatcher] Unwatched ${descriptiveName} successfully.`
        );
      } catch (error) {
        console.error(
          `[MarketEventWatcher] Error unwatching ${descriptiveName}:`,
          error
        );
        Sentry.withScope((scope) => {
          scope.setExtra('marketAddress', marketGroup.address);
          scope.setExtra('chainId', chainId);
          Sentry.captureException(error);
        });
      }
      currentUnwatch = null;
    }
  };
};

// Iterates over all blocks from the market group's deploy block to the current block and calls upsertEvent for each one.
export const reindexMarketGroupEvents = async (marketGroup: any) => {
  const client = getProviderForChain(marketGroup.chainId);
  const chainId = await client.getChainId();

  // TODO: Get market group data from contract

  // Update collateral data

  await updateCollateralData(client, marketGroup);
  await prisma.marketGroup.update({
    where: { id: marketGroup.id },
    data: extractMarketGroupFields(marketGroup),
  });

  // Get the contract deployment time and us it as initial lookback start time
  let deploymentBlock;
  try {
    deploymentBlock = await getContractCreationBlock(
      client,
      marketGroup.address
    );
  } catch (err) {
    const error = err as Error;
    console.error(`Failed to get contract creation block: ${error.message}`);
    throw new Error(`Failed to get contract creation block: ${error.message}`);
  }

  // Use the later of the deployment block or the lookback start block
  const startBlock = Math.max(
    Number(marketGroup.deployTxnBlockNumber || 0),
    Number(deploymentBlock.block.number)
  );

  // Get the end block using the sooner of market end time and current time
  const currentTime = Math.floor(Date.now() / 1000);
  const endTime = currentTime;

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
    `Reindexing market group events for market group ${marketGroup.address} from block ${startBlock} to ${endBlock.number}`
  );

  // Function to process logs regardless of how they were fetched
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      try {
        const decodedLog = decodeEventLog({
          abi: Sapience.abi,
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

        // Extract marketId from logData
        const eventMarketId = logData.args?.marketId || 0;

        await upsertEvent(
          chainId,
          marketGroup.address,
          eventMarketId,
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
        address: marketGroup.address as `0x${string}`,
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
            address: marketGroup.address as `0x${string}`,
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
    `Completed indexing for market group ${marketGroup.address}. Processed ${totalLogsProcessed} logs.`
  );
};

// Upserts an event into the database using the proper helper function.
const upsertEvent = async (
  chainId: number,
  market_groupAddress: string,
  marketId: number,
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: LogData
) => {
  console.log('handling event upsert:', {
    chainId,
    address: market_groupAddress,
    marketId: marketId,
    blockNumber,
    timeStamp,
    logIndex,
    logData,
  });

  // Find market group
  const market_group = await prisma.marketGroup.findFirst({
    where: { chainId, address: market_groupAddress.toLowerCase() },
  });

  if (!market_group) {
    throw new Error(
      `Market group not found for chainId ${chainId} and address ${market_groupAddress}. Cannot upsert event into db.`
    );
  }

  try {
    // Check if event already exists
    const existingEvent = await prisma.event.findFirst({
      where: {
        transactionHash: logData.transactionHash,
        marketGroupId: market_group.id,
        blockNumber: Number(blockNumber),
        logIndex: logIndex,
      },
      include: { market_group: true },
    });

    if (existingEvent) {
      console.log('Event already exists, processing existing event');
      // Update the existing event with any new data
      const updatedEvent = await prisma.event.update({
        where: { id: existingEvent.id },
        data: {
          timestamp: BigInt(timeStamp.toString()),
          logData: logData as any,
        },
        include: { market_group: true },
      });

      await upsertEntitiesFromEvent(
        updatedEvent,
        market_groupAddress,
        marketId,
        chainId
      );
      return updatedEvent;
    }

    console.log('inserting new event..');
    const newEvent = await prisma.event.create({
      data: {
        marketGroupId: market_group.id,
        blockNumber: Number(blockNumber),
        timestamp: BigInt(timeStamp.toString()),
        logIndex: logIndex,
        logData: logData as any,
        transactionHash: logData.transactionHash,
      },
      include: { market_group: true },
    });

    await upsertEntitiesFromEvent(
      newEvent,
      market_groupAddress,
      marketId,
      chainId
    );
    return newEvent;
  } catch (error) {
    console.error('Error upserting event:', error);
    throw error;
  }
};

// Triggered by the callback in the Event model, this upserts related entities (Transaction, Position, MarketPrice).
export const upsertEntitiesFromEvent = async (
  event: any, // Using any for now since this depends on helper functions that need migration
  market_groupAddress: string,
  marketId: number,
  chainId: number
) => {
  // First check if this event has already been processed by looking for an existing transaction
  const existingTransaction = await prisma.transaction.findFirst({
    where: { eventId: event.id },
  });

  if (existingTransaction) {
    if (event.logData.eventName != EventType.PositionSettled) {
      return;
    }
  }

  let skipTransaction = false;
  const newTransaction: Transaction & {
    event: any;
    position?: any;
  } = {
    eventId: event.id,
    type: 'addLiquidity' as any,
    baseToken: null,
    quoteToken: null,
    borrowedBaseToken: null,
    borrowedQuoteToken: null,
    collateral: '0',
    lpBaseDeltaToken: null,
    lpQuoteDeltaToken: null,
    tradeRatioD18: null,
    positionId: null,
    marketPriceId: null,
    collateralTransferId: null,
    id: 0,
    createdAt: new Date(),
    event: event,
    position: null,
  };

  // Process the event based on its type
  switch (event.logData.eventName) {
    // Market Group events
    case EventType.MarketGroupInitialized: {
      console.log('initializing market group. event: ', event);
      const marketGroupCreatedArgs = {
        initialOwner: event.logData.args.initialOwner,
        collateralAsset: event.logData.args.collateralAsset,
        feeCollectorNFT: event.logData.args.feeCollectorNFT,
        minTradeSize: event.logData.args.minTradeSize,
        isBridged: event.logData.args.bridgedSettlement,
        marketParams: event.logData.args.marketParams,
      } as MarketGroupCreatedUpdatedEventLog;

      await createOrUpdateMarketGroupFromEvent(
        marketGroupCreatedArgs,
        event.market_group.chainId,
        event.market_group.address,
        event.market_group
      );
      skipTransaction = true;
      break;
    }
    case EventType.MarketGroupUpdated: {
      console.log('updating market. event: ', event);
      const marketUpdatedArgs = {
        marketParams: event.logData.args.marketParams,
      } as MarketGroupCreatedUpdatedEventLog;

      await createOrUpdateMarketGroupFromEvent(
        marketUpdatedArgs,
        event.market_group.chainId,
        event.market_group.address,
        event.market_group
      );
      skipTransaction = true;
      break;
    }

    // Market events
    case EventType.MarketCreated: {
      console.log('creating market. event: ', event);
      const marketCreatedArgs = {
        marketId: event.logData.args.marketId,
        startTime: event.logData.args.startTime,
        endTime: event.logData.args.endTime,
        startingSqrtPriceX96: event.logData.args.startingSqrtPriceX96,
        claimStatementYesOrNumeric:
          event.logData.args.claimStatementYesOrNumeric,
        claimStatementNo: event.logData.args.claimStatementNo,
      } as MarketCreatedEventLog;

      await createMarketFromEvent(marketCreatedArgs, event.market_group);
      await createOrUpdateMarketFromContract(
        event.market_group,
        Number(marketCreatedArgs.marketId)
      );
      skipTransaction = true;
      break;
    }
    case EventType.MarketSettled: {
      console.log('Market settled event. event: ', event);
      const market = await prisma.market.findFirst({
        where: {
          market_group: {
            address: event.market_group.address.toLowerCase(),
            chainId: event.market_group.chainId,
          },
          marketId: Number(event.logData.args.marketId),
        },
        include: { market_group: true },
      });

      if (market) {
        const settlementSqrtPriceX96: bigint = BigInt(
          (event.logData.args.settlementSqrtPriceX96 as string)?.toString() ??
            '0'
        );
        const settlementPriceD18 = sqrtPriceX96ToSettlementPriceD18(
          settlementSqrtPriceX96
        );

        await prisma.market.update({
          where: { id: market.id },
          data: {
            settled: true,
            settlementPriceD18: settlementPriceD18.toString(),
          },
        });

        // Kick off accuracy scoring for this market asynchronously (idempotent)
        // Prefer background job to avoid blocking the event loop
        const addr = event.market_group.address;
        const mId = String(event.logData.args.marketId);
        const isProduction =
          process.env.NODE_ENV === 'production' ||
          process.env.NODE_ENV === 'staging';

        (async () => {
          try {
            if (isProduction) {
              const renderServices = await fetchRenderServices();
              const worker = renderServices.find(
                (item: any) =>
                  item?.service?.type === 'background_worker' &&
                  item?.service?.name?.startsWith('background-worker') &&
                  item?.service?.branch ===
                    (process.env.NODE_ENV === 'staging' ? 'staging' : 'main')
              );

              if (!worker?.service?.id) {
                console.error(
                  'Background worker not found for accuracy reindex. Falling back to inline reindex.'
                );
                await reindexAccuracy(addr, mId);
                return;
              }

              const startCommand = `pnpm run start:reindex-accuracy ${addr} ${mId}`;
              await createRenderJob(worker.service.id, startCommand);
              console.log(
                '[Accuracy] Enqueued background reindex job via Render'
              );
            } else {
              // Local dev: spawn detached process
              const { spawn } = await import('child_process');
              const child = spawn(
                'pnpm',
                ['run', 'start:reindex-accuracy', addr, mId],
                {
                  stdio: 'ignore',
                  detached: true,
                }
              );
              child.unref();
              console.log('[Accuracy] Spawned local detached reindex process');
            }
          } catch (err) {
            console.error(
              '[Accuracy] Failed to enqueue async reindex, falling back to inline reindex:',
              err
            );
            try {
              await reindexAccuracy(addr, mId);
            } catch (fallbackErr) {
              console.error(
                '[Accuracy] Inline reindex fallback failed:',
                fallbackErr
              );
            }
          }
        })();
      } else {
        console.error('Market not found for market: ', event.market_group);
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
      settledPositions.push(event.logData.args.positionId);

      await Promise.all([
        handlePositionSettledEvent(event),
        updateTransactionFromPositionSettledEvent(
          newTransaction,
          event,
          market_groupAddress,
          marketId,
          chainId
        ),
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
      console.log('Unhandled event: ', event.logData.eventName);
      skipTransaction = true;
      break;
  }

  if (!skipTransaction) {
    try {
      // Ensure collateral is set to a default value if not present
      if (!newTransaction.collateral) {
        newTransaction.collateral = '0';
      }

      // Ensure all required fields have values
      if (!newTransaction.baseToken) newTransaction.baseToken = null;
      if (!newTransaction.quoteToken) newTransaction.quoteToken = null;
      if (!newTransaction.borrowedBaseToken)
        newTransaction.borrowedBaseToken = null;
      if (!newTransaction.borrowedQuoteToken)
        newTransaction.borrowedQuoteToken = null;
      if (!newTransaction.tradeRatioD18) newTransaction.tradeRatioD18 = null;

      // Save the transaction
      console.log('Saving new transaction: ', newTransaction);
      const savedTransaction = await prisma.transaction.create({
        data: {
          eventId: newTransaction.eventId,
          type: newTransaction.type,
          baseToken: newTransaction.baseToken,
          quoteToken: newTransaction.quoteToken,
          borrowedBaseToken: newTransaction.borrowedBaseToken,
          borrowedQuoteToken: newTransaction.borrowedQuoteToken,
          collateral: newTransaction.collateral,
          lpBaseDeltaToken: newTransaction.lpBaseDeltaToken,
          lpQuoteDeltaToken: newTransaction.lpQuoteDeltaToken,
          tradeRatioD18: newTransaction.tradeRatioD18,
          positionId: newTransaction.positionId,
          marketPriceId: newTransaction.marketPriceId,
          collateralTransferId: newTransaction.collateralTransferId,
        },
      });

      newTransaction.id = savedTransaction.id;

      await insertCollateralTransfer(newTransaction);
      await insertMarketPrice(newTransaction);

      // Then create or modify the position with the saved transaction
      try {
        // Add the event and position properties to the saved transaction
        const transactionWithEvent = {
          ...savedTransaction,
          event: event,
          position: null,
        };

        await createOrModifyPositionFromTransaction(transactionWithEvent);
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
