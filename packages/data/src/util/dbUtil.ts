import dataSource from "../db";
import { Event } from "../entity/Event";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import {
  EpochCreatedEventLog,
  EventType,
  LiquidityPositionClosedEventLog,
  LiquidityPositionCreatedEventLog,
  LiquidityPositionModifiedEventLog,
  TradePositionEventLog,
} from "../interfaces/interfaces";
import { MarketPrice } from "../entity/MarketPrice";
import { formatUnits } from "viem";
import { LessThanOrEqual } from "typeorm";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { FEE, TOKEN_PRECISION } from "../constants";

// TODO GET FEE FROM CONTRACT
const tickToPrice = (tick: number): number => (1 + FEE) ** tick;

const getTradeTypeFromEvent = (eventArgs: TradePositionEventLog) => {
  if (BigInt(eventArgs.finalPrice) > BigInt(eventArgs.initialPrice)) {
    return TransactionType.LONG;
  }
  return TransactionType.SHORT;
};

export const upsertTransactionPositionPriceFromEvent = async (event: Event) => {
  const transactionRepository = dataSource.getRepository(Transaction);

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
 * Creates or modifies a Position in the database based on the given Transaction.
 * @param transaction the Transaction to use for creating/modifying the position
 */
export const createOrModifyPosition = async (transaction: Transaction) => {
  const positionRepository = dataSource.getRepository(Position);

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

  position.isLP = isLpPosition(transaction, existingPosition);
  position.positionId = Number(eventArgs.positionId);

  position.baseToken = eventArgs.baseToken?.toString() || position.baseToken;
  position.quoteToken = eventArgs.quoteToken?.toString() || position.quoteToken;
  position.borrowedBaseToken =
    eventArgs.borrowedBaseToken?.toString() || position.borrowedBaseToken;
  position.borrowedQuoteToken =
    eventArgs.borrowedQuoteToken?.toString() || position.borrowedQuoteToken;

  position.collateral = (
    BigInt(originalCollateral) + BigInt(transaction.collateralDelta)
  ).toString(); //TODO: figure out what to do with a lp closed and changed to trade position
  if (eventArgs.upperTick && eventArgs.lowerTick) {
    position.highPrice = tickToPrice(eventArgs.upperTick).toString();
    position.lowPrice = tickToPrice(eventArgs.lowerTick).toString();
  }
  position.epoch = transaction.event.epoch;
  position.profitLoss = "0"; //TODO
  position.unclaimedFees = "0"; //TODO
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
    const mpRepository = dataSource.getRepository(MarketPrice);
    // upsert market price
    const newMp = new MarketPrice(); // might already get saved when upserting txn
    const finalPrice = transaction.event.logData.args.finalPrice;
    newMp.value = finalPrice;
    newMp.timestamp = transaction.event.timestamp;
    newMp.transaction = transaction;
    console.log("upserting market price: ", newMp);
    await mpRepository.save(newMp);
  }
};
/**
 * Updates a Transaction with the relevant information from a LiquidityPositionModifiedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionModifiedEventLog args
 * @param isDecrease whether the event is a decrease or increase in liquidity
 */
const updateTransactionFromLiquidityClosedEvent = async (
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
const updateTransactionFromLiquidityModifiedEvent = async (
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
  console.log("originalPosition", originalPosition);
  const collateralDeltaBigInt =
    BigInt(eventArgsModifyLiquidity.collateralAmount) -
    BigInt(originalPosition.collateral);
  newTransaction.baseTokenDelta = eventArgsModifyLiquidity.amount0;
  newTransaction.quoteTokenDelta = eventArgsModifyLiquidity.amount1;
  newTransaction.collateralDelta = collateralDeltaBigInt.toString();
};

/**
 * Updates a Transaction with the relevant information from a LiquidityPositionCreatedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionCreatedEventLog args
 */
const updateTransactionFromAddLiquidityEvent = (
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
const updateTransactionFromTradeModifiedEvent = async (
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
 * Format a BigInt value from the DB to a string with 3 decimal places.
 * @param value - a string representation of a BigInt value
 * @returns a string representation of the value with 3 decimal places
 */
export const formatDbBigInt = (value: string) => {
  if (Number(value) === 0) {
    return "0";
  }
  const formatted = formatUnits(BigInt(value), TOKEN_PRECISION);
  const number = Number(formatted);
  return number.toFixed(4);
};

export const didMarketPriceChangeSincePositionOpen = async (
  position: Position,
  transaction: Transaction
) => {
  const openingTxn = position.transactions.find((txn) => {
    return txn.event.logData.eventName === EventType.LiquidityPositionCreated;
  });
  if (!openingTxn) {
    return false;
  }
  const openingTimestamp = openingTxn.event.timestamp;
  const marketPriceRepository = dataSource.getRepository(MarketPrice);
  const marketPriceAtTimestamp = await marketPriceRepository.findOne({
    where: { timestamp: LessThanOrEqual(openingTimestamp) },
    order: { timestamp: "DESC" },
  });
  const prevMarketPrice = marketPriceAtTimestamp?.value;

  const newMarketPrice: string = transaction.event.logData.args.finalPrice;

  return newMarketPrice !== prevMarketPrice;
};

const isLpPosition = (
  transaction: Transaction,
  existingPosition: Position | null
) => {
  if (transaction.type === TransactionType.ADD_LIQUIDITY) {
    return true;
  } else if (transaction.type === TransactionType.REMOVE_LIQUIDITY) {
    // for remove liquidity, check if the position closed and market price changed, which means it becomes a trade position
    const eventName = transaction.event.logData.eventName;
    if (eventName === EventType.LiquidityPositionClosed && existingPosition) {
      return !didMarketPriceChangeSincePositionOpen(
        existingPosition,
        transaction
      );
    }
    return true;
  }
  return false;
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
