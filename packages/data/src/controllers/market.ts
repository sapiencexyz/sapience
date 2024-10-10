import "tsconfig-paths/register";
import {
  epochRepository,
  eventRepository,
  initializeDataSource,
  marketPriceRepository,
  marketRepository,
  positionRepository,
  transactionRepository,
} from "../db";
import { Event } from "../entity/Event";
import { EpochParams } from "../entity/EpochParams";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import { Abi, decodeEventLog, Log, PublicClient } from "viem";
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  MarketInfo,
  LiquidityPositionClosedEventLog,
  LiquidityPositionCreatedEventLog,
  LiquidityPositionModifiedEventLog,
  TradePositionEventLog,
  EventType,
} from "../interfaces/interfaces";
import { getProviderForChain, bigintReplacer, tickToPrice } from "../helpers";
import { MarketPrice } from "../entity/MarketPrice";

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

      await handleMarketEventUpsert(
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

  await indexMarketEventsRange(
    client,
    startBlock,
    Number(endBlock),
    market.address,
    abi
  );
};

export const handleEventAfterUpsert = async (event: Event) => {
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

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
const handleTransferEvent = async (event: Event) => {
  const { from, to, tokenId } = event.logData.args;

  const existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(tokenId),
      epoch: { id: event.epoch.id },
    },
  });

  const position = existingPosition || new Position();
  // Fill position with minimun data to save it
  if (!existingPosition) {
    // Need to create an empty position
    position.positionId = Number(tokenId);
    position.epoch = event.epoch;
    position.baseToken = "0";
    position.quoteToken = "0";
    position.borrowedBaseToken = "0";
    position.borrowedQuoteToken = "0";
    position.collateral = "0";
    position.isLP = false;
    position.transactions = position.transactions || [];
  }

  position.owner = to;
  await positionRepository.save(position);
  console.log(`Updated owner of position ${tokenId} to ${to}`);
};

/**
 * Creates or modifies a Position in the database based on the given Transaction.
 * @param transaction the Transaction to use for creating/modifying the position
 */
export const createOrModifyPosition = async (transaction: Transaction) => {
  const existingPosition = await positionRepository.findOne({
    where: {
      epoch: {
        id: transaction.event.epoch.id,
        market: { address: transaction.event.epoch.market.address },
      },
      positionId: transaction.event.logData.args.positionId,
    },
    relations: [
      "transactions",
      "epoch",
      "epoch.market",
      "transactions.event",
      "transactions.marketPrice",
    ],
  });

  const originalCollateral = existingPosition
    ? existingPosition.collateral
    : "0";
  const eventArgs = transaction.event.logData.args; //as LiquidityPositionModifiedEventLog;
  const position = existingPosition || new Position();

  if (existingPosition) {
    console.log("existing position: ", existingPosition);
  }
  console.log("eventArgs: =", eventArgs);

  position.isLP = isLpPosition(transaction);
  position.positionId = Number(eventArgs.positionId);

  position.baseToken =
    eventArgs.vGasAmount?.toString() ||
    eventArgs.loanAmount0?.toString() ||
    position.baseToken ||
    eventArgs.addedAmount0?.toString();
  position.quoteToken =
    eventArgs.vEthAmount?.toString() ||
    eventArgs.loanAmount1?.toString() ||
    position.quoteToken ||
    eventArgs.addedAmount1?.toString();
  position.borrowedBaseToken =
    eventArgs.borrowedVGas?.toString() || position.borrowedBaseToken;
  position.borrowedQuoteToken =
    eventArgs.borrowedVEth?.toString() || position.borrowedQuoteToken;

  position.collateral = (
    BigInt(originalCollateral) + BigInt(transaction.collateralDelta)
  ).toString(); //TODO: figure out what to do with a lp closed and changed to trade position
  if (eventArgs.upperTick && eventArgs.lowerTick) {
    position.highPrice = tickToPrice(eventArgs.upperTick).toString();
    position.lowPrice = tickToPrice(eventArgs.lowerTick).toString();
  }
  position.epoch = transaction.event.epoch;
  position.transactions = position.transactions || [];
  position.transactions.push(transaction);

  console.log("Saving position: ", position);
  await positionRepository.save(position);
};

/**
 * Upsert a MarketPrice given a Transaction.
 * @param transaction the Transaction to upsert a MarketPrice for
 */
export const upsertMarketPrice = async (transaction: Transaction) => {
  if (
    transaction.type === TransactionType.LONG ||
    transaction.type === TransactionType.SHORT
  ) {
    console.log("Upserting market price for transaction: ", transaction);
    // upsert market price
    const newMp = new MarketPrice(); // might already get saved when upserting txn
    const finalPrice = transaction.event.logData.args.finalPrice;
    newMp.value = finalPrice;
    newMp.timestamp = transaction.event.timestamp;
    newMp.transaction = transaction;
    console.log("upserting market price: ", newMp);
    await marketPriceRepository.save(newMp);
  }
};

const isLpPosition = (transaction: Transaction) => {
  if (transaction.type === TransactionType.ADD_LIQUIDITY) {
    return true;
  } else if (transaction.type === TransactionType.REMOVE_LIQUIDITY) {
    // for remove liquidity, check if the position closed and market price changed, which means it becomes a trade position
    const eventName = transaction.event.logData.eventName;
    if (
      eventName === EventType.LiquidityPositionClosed &&
      `${transaction.event.logData.args.kind}` === "2"
    ) {
      return false;
    }
    return true;
  }
  return false;
};

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
  updatedMarket.deployTxnBlockNumber = Number(
    contractDeployment.deployTxnBlockNumber
  );
  updatedMarket.deployTimestamp = Number(contractDeployment.deployTimestamp);
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
    BigInt(eventArgsCreateTrade.vGasAmount) - BigInt(baseTokenInitial)
  ).toString();
  newTransaction.quoteTokenDelta = (
    BigInt(eventArgsCreateTrade.vEthAmount) - BigInt(quoteTokenInitial)
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
