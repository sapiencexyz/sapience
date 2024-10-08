import dataSource from "../db";
import { Event } from "../entity/Event";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import { EventType } from "../interfaces/interfaces";
import { MarketPrice } from "../entity/MarketPrice";
import { formatUnits } from "viem";
import { LessThanOrEqual } from "typeorm";
import { FEE, TOKEN_PRECISION } from "../constants";
import {
  updateTransactionFromAddLiquidityEvent,
  updateTransactionFromLiquidityClosedEvent,
  updateTransactionFromLiquidityModifiedEvent,
  updateTransactionFromTradeModifiedEvent,
} from "./eventUtil";

// TODO GET FEE FROM CONTRACT
const tickToPrice = (tick: number): number => (1 + FEE) ** tick;

export const upsertTransactionPositionPriceFromEvent = async (event: Event) => {
  const transactionRepository = dataSource.getRepository(Transaction);
  const positionRepository = dataSource.getRepository(Position);

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
  const positionRepository = dataSource.getRepository(Position);
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
