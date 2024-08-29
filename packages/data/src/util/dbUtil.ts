import dataSource, { initializeDataSource } from "../db";
import { Event } from "../entity/Event";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import {
  EventType,
  LiquidityPositionCreatedEventLog,
  TradePositionEventLog,
} from "../interfaces/interfaces";
import { MarketPrice } from "../entity/MarketPrice";

export const NUMERIC_PRECISION = 78;
export const DECIMAL_PRECISION = 18;
export const DECIMAL_SCALE = 15;

// TODO GET FEE FROM CONTRACT
const FEE = 0.0001;
const tickToPrice = (tick: number): number => (1 + FEE) ** tick;

const getTradeTypeFromEvent = (eventArgs: TradePositionEventLog) => {
  if (eventArgs.finalPrice > eventArgs.initialPrice) {
    return TransactionType.LONG;
  }
  return TransactionType.SHORT;
};

export const upsertTransactionFromEvent = async (event: Event) => {
  const transactionRepository = dataSource.getRepository(Transaction);

  const newTransaction = new Transaction();
  newTransaction.event = event;

  // set to true if the Event does not require a transaction (i.e. a Transfer event)
  let skipTransaction = false;

  // TODO - figure out signed deltas
  switch (event.logData.eventName) {
    case EventType.LiquidityPositionCreated:
      console.log("Creating liquidity position from event: ", event);
      newTransaction.type = TransactionType.ADD_LIQUIDITY;
      const eventArgsAddLiquidity = event.logData
        .args as LiquidityPositionCreatedEventLog;
      newTransaction.baseTokenDelta = eventArgsAddLiquidity.addedAmount0;
      newTransaction.quoteTokenDelta = eventArgsAddLiquidity.addedAmount1;
      newTransaction.collateralDelta = eventArgsAddLiquidity.collateralAmount;
      // await upsertPositionFromLiquidityEvent(event);
      break;
    case EventType.LiquidityPositionClosed:
      console.log("Closing liquidity position from event: ", event);
      newTransaction.type = TransactionType.REMOVE_LIQUIDITY;
      break;
    case EventType.LiquidityPositionDecreased:
      console.log("Decreasing liquidity position from event: ", event);
      newTransaction.type = TransactionType.REMOVE_LIQUIDITY;
      break;
    case EventType.LiquidityPositionIncreased:
      console.log("Increasing liquidity position from event: ", event);
      newTransaction.type = TransactionType.ADD_LIQUIDITY;
      break;
    case EventType.TraderPositionCreated:
      console.log("Creating trader position from event: ", event);
      newTransaction.type = getTradeTypeFromEvent(
        event.logData.args as TradePositionEventLog
      );
      break;
    case EventType.TraderPositionModified:
      console.log("Modifying trader position from event: ", event);
      newTransaction.type = getTradeTypeFromEvent(
        event.logData.args as TradePositionEventLog
      );
      break;
    default:
      skipTransaction = true;
      break;
  }

  // upsert instead?
  if (!skipTransaction) {
    console.log("Saving new transaction: ", newTransaction);
    await transactionRepository.save(newTransaction);
  }
};

export const createOrModifyPosition = async (transaction: Transaction) => {
  await initializeDataSource(); // get rid of?
  const positionRepository = dataSource.getRepository(Position);

  const existingPosition = await positionRepository.findOne({
    where: {
      epoch: transaction.event.epoch,
      positionId: transaction.event.logData.args.positionId,
    },
  });
  const posTxns = existingPosition ? existingPosition.transactions : [];
  const originalBaseToken = existingPosition ? existingPosition.baseToken : 0;
  const originalQuoteToken = existingPosition ? existingPosition.quoteToken : 0;
  const originalCollateral = existingPosition ? existingPosition.collateral : 0;

  const isLp =
    transaction.type === TransactionType.ADD_LIQUIDITY ||
    transaction.type === TransactionType.REMOVE_LIQUIDITY;
  const eventArgs = transaction.event.logData.args; //as LiquidityPositionModifiedEventLog;

  const position = new Position();
  position.isLP = isLp;
  position.positionId = Number(eventArgs.positionId);
  position.baseToken = originalBaseToken + transaction.baseTokenDelta;
  position.quoteToken = originalQuoteToken + transaction.quoteTokenDelta;
  position.collateral = originalCollateral + transaction.collateralDelta;
  if (eventArgs.upperTick && eventArgs.lowerTick) {
    position.highPrice = tickToPrice(eventArgs.upperTick).toString();
    position.lowPrice = tickToPrice(eventArgs.lowerTick).toString();
  }
  position.epoch = transaction.event.epoch;
  position.profitLoss = "0"; //TODO
  position.unclaimedFees = "0"; //TODO
  position.transactions = [...posTxns, transaction];
  // Need to save transaction as well?

  // upsert to database
  console.log("Saving position: ", position);
  await positionRepository.save(position);
};

export const upsertMarketPrice = async (transaction: Transaction) => {
  if (
    transaction.type === TransactionType.LONG ||
    transaction.type === TransactionType.SHORT
  ) {
    const mpRepository = dataSource.getRepository(MarketPrice);
    // upsert market price
    const newMp = new MarketPrice(); // might already get saved when upserting txn
    const finalPrice = transaction.event.logData.args.finalPrice;
    newMp.value = finalPrice;
    newMp.timestamp = transaction.event.timestamp;
    newMp.transaction = transaction;
    await mpRepository.upsert(newMp, ["timestamp", "transaction"]);
    // match on timestamp and txn
  }
};

export const upsertPositionFromLiquidityEvent = async (event: Event) => {
  await initializeDataSource();

  const positionRepository = dataSource.getRepository(Position);

  // create new position
  const eventArgs = event.logData.args as LiquidityPositionCreatedEventLog;

  const newPosition = new Position();
  newPosition.positionId = Number(eventArgs.positionId);
  newPosition.baseToken = eventArgs.addedAmount0;
  newPosition.quoteToken = eventArgs.addedAmount1;
  newPosition.collateral = eventArgs.collateralAmount;
  newPosition.profitLoss = "0"; // TODO
  newPosition.isLP = true;
  newPosition.epoch = event.epoch;
  newPosition.highPrice = tickToPrice(eventArgs.upperTick).toString();
  newPosition.lowPrice = tickToPrice(eventArgs.lowerTick).toString();
  newPosition.unclaimedFees = "0"; // TODO
  await positionRepository.upsert(newPosition, ["epoch", "positionId"]);

  // create txn based on position:
  await createTxnFromLiquidityPositionCreatedEvent(event, newPosition);
};

/**
 * Creates a new Transaction from a LiquidityPositionCreatedEventLog, and upserts it to the database.
 * @param event The Event object containing the LiquidityPositionCreatedEventLog.
 * @param position The Position object associated with the event.
 */
const createTxnFromLiquidityPositionCreatedEvent = async (
  event: Event,
  position: Position
) => {
  const transactionRepository = dataSource.getRepository(Transaction);
  const eventArgs = event.logData.args as LiquidityPositionCreatedEventLog;

  const newTransaction = new Transaction();
  newTransaction.type = TransactionType.ADD_LIQUIDITY;
  newTransaction.position = position;
  newTransaction.event = event;
  newTransaction.baseTokenDelta = eventArgs.addedAmount0;
  newTransaction.quoteTokenDelta = eventArgs.addedAmount1;
  newTransaction.collateralDelta = eventArgs.collateralAmount;

  await transactionRepository.save(newTransaction);
};

// function getTransactionTypeFromEvent(
//   event: Event
// ): TransactionType | undefined {
//   const eventName = event.logData.eventName;
//   if (
//     eventName === EventType.LiquidityPositionCreated ||
//     eventName === EventType.LiquidityPositionIncreased
//   ) {
//     return TransactionType.ADD_LIQUIDITY;
//   }
//   if (
//     eventName === EventType.LiquidityPositionDecreased ||
//     eventName === EventType.LiquidityPositionClosed
//   ) {
//     return TransactionType.REMOVE_LIQUIDITY;
//   }
//   if (
//     eventName == EventType.TraderPositionCreated ||
//     eventName === EventType.TraderPositionModified
//   ) {
//     const eventArgs = event.logData.args as TradePositionEventLog;
//     if (BigInt(eventArgs.vGasAmount) > 0n) {
//       return TransactionType.LONG;
//     } else {
//       return TransactionType.SHORT;
//     }
//   }
//   return;
// }

// export const upsertTxnFromEvent = async (event: Event) => {
//   const transactionType = getTransactionTypeFromEvent(event);
//   if (!transactionType) {
//     // no transaction associated with event
//     return;
//   }
//   await initializeDataSource();
//   const transactionRepository = dataSource.getRepository(Transaction);

//   // create new transaction
//   const newTransaction = new Transaction();
//   newTransaction.type = transactionType;

//   // handle Liquidity Transactions
//   if (
//     transactionType === TransactionType.ADD_LIQUIDITY ||
//     transactionType === TransactionType.REMOVE_LIQUIDITY
//   ) {
//     const eventArgs = event.logData.args as LiquidityPositionCreatedEventLog;
//     newTransaction.baseTokenDelta = BigInt(eventArgs.addedAmount0);
//     newTransaction.quoteTokenDelta = BigInt(eventArgs.addedAmount1);
//     newTransaction.collateralDelta = BigInt(eventArgs.collateralAmount);
//   } else {
//     // handle Trade Transactions
//     const eventArgs = event.logData.args as TradePositionEventLog;
//     newTransaction.baseTokenDelta = BigInt(eventArgs.vEthAmount);
//     newTransaction.quoteTokenDelta = BigInt(eventArgs.vGasAmount);
//     newTransaction.collateralDelta = BigInt(eventArgs.collateralAmount);
//     newTransaction.marketPrice = new MarketPrice();
//     newTransaction.marketPrice.value = BigInt(eventArgs.finalPrice);
//   }

//   await transactionRepository.save(newTransaction);
// };
