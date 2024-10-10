import "tsconfig-paths/register";
import {
  epochRepository,
  marketPriceRepository,
  marketRepository,
  positionRepository,
} from "../db";
import { Event } from "../entity/Event";
import { EpochParams } from "../entity/EpochParams";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { Position } from "../entity/Position";
import { Transaction, TransactionType } from "../entity/Transaction";
import { PublicClient } from "viem";
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  LiquidityPositionClosedEventLog,
  LiquidityPositionCreatedEventLog,
  LiquidityPositionModifiedEventLog,
  TradePositionEventLog,
  EventType,
} from "../interfaces";
import { tickToPrice } from "../helpers";
import { MarketPrice } from "../entity/MarketPrice";

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (event: Event) => {
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

/**
 * Creates or updates a Market entity in the database from a MarketCreatedUpdatedEventLog event.
 * If originalMarket is provided, it will be updated with the new data. Otherwise, a new Market entity will be created.
 * @param eventArgs The event log data from the MarketCreatedUpdatedEventLog event.
 * @param chainId The chain id of the market.
 * @param address The address of the market.
 * @param originalMarket The original Market entity to be updated, if any.
 * @returns The saved Market entity.
 */
export const createOrUpdateMarketFromEvent = async (
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
