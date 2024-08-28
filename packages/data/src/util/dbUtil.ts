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
// TODO GET FEE FROM CONTRACT
const FEE = 0.0001;
const tickToPrice = (tick: number): number => (1 + FEE) ** tick;

export const upsertPositionFromLiquidityEvent = async (event: Event) => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);

  // create new position
  const eventArgs = event.logData.args as LiquidityPositionCreatedEventLog;
  const newPosition = new Position();
  newPosition.contractId = event.contractId;
  newPosition.nftId = Number(eventArgs.positionId);
  newPosition.baseToken = eventArgs.addedAmount0;
  newPosition.quoteToken = eventArgs.addedAmount1;
  newPosition.collateral = eventArgs.collateralAmount;
  newPosition.profitLoss = 0; // TODO
  newPosition.isLP = true;
  newPosition.highPrice = tickToPrice(eventArgs.upperTick);
  newPosition.lowPrice = tickToPrice(eventArgs.lowerTick);
  newPosition.unclaimedFees = 0; // TODO
  await positionRepository.upsert(newPosition, ["contractId", "nftId"]);

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
