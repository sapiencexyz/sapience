import "tsconfig-paths/register";
import {
  epochRepository,
  marketPriceRepository,
  marketRepository,
  positionRepository,
  collateralTransferRepository,
} from "../db";
import { Event } from "../models/Event";
import { MarketParams } from "../models/MarketParams";
import { Market } from "../models/Market";
import { Epoch } from "../models/Epoch";
import { Position } from "../models/Position";
import { Transaction, TransactionType } from "../models/Transaction";
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
  EventTransactionType,
  MarketInfo,
  PositionSettledEventLog,
  PositionUpdatedEventLog,
  EpochData,
} from "../interfaces";
import { MarketPrice } from "../models/MarketPrice";
import { getBlockByTimestamp, getProviderForChain } from "../helpers";
import { CollateralTransfer } from "src/models/CollateralTransfer";

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (event: Event) => {
  const { from, to, tokenId } = event.logData.args;

  let existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(tokenId),
      epoch: {
        market: {
          address: event.market.address,
          chainId: event.market.chainId,
        },
      },
    },
  });

  if (!existingPosition) {
    // Ignore the transfer event until the position is created from another event
    console.log("Position not found for transfer event: ", event);
    return;
  }

  existingPosition.owner = to;
  await positionRepository.save(existingPosition);
  console.log(`Updated owner of position ${tokenId} to ${to}`);
};

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handlePositionSettledEvent = async (event: Event) => {
  const { positionId } = event.logData.args;

  let existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(positionId),
    },
  });

  if (!existingPosition) {
    // Ignore the settled event until the position is created from another event
    console.log("Position not found for settled event: ", event);
    return;
  }

  existingPosition.isSettled = true;
  await positionRepository.save(existingPosition);
  console.log(`Updated isSettled state of position ${positionId} to true`);
};

/**
 * Creates or modifies a Position in the database based on the given Transaction.
 * @param transaction the Transaction to use for creating/modifying the position
 */
export const createOrModifyPositionFromTransaction = async (
  transaction: Transaction
) => {
  const eventArgs = transaction.event.logData.args;
  const epochId = eventArgs.epochId;

  const existingPosition = await positionRepository.findOne({
    where: {
      epoch: {
        epochId: epochId,
        market: { address: transaction.event.market.address },
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

  const epoch = await epochRepository.findOne({
    where: {
      epochId: epochId,
      market: { address: transaction.event.market.address },
    },
  });
  if (!epoch) {
    console.error(
      "Epoch not found: ",
      epochId,
      "market:",
      transaction.event.market.address
    );
    return;
  }

  const position = existingPosition || new Position();

  if (existingPosition) {
    console.log("existing position: ", existingPosition);
  }
  console.log("eventArgs: =", eventArgs);

  position.positionId = Number(eventArgs.positionId);

  if (eventArgs.upperTick && eventArgs.lowerTick) {
    position.highPriceTick = eventArgs.upperTick.toString();
    position.lowPriceTick = eventArgs.lowerTick.toString();
  }
  position.epoch = epoch;
  position.transactions = position.transactions || [];
  position.transactions.push(transaction);

  console.log("Saving position: ", position);
  await positionRepository.save(position);
};

/**
 * Upsert a MarketPrice given a Transaction.
 * @param transaction the Transaction to upsert a MarketPrice for
 */
export const insertMarketPrice = async (transaction: Transaction) => {
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
  const marketParamsRaw = marketReadResult[4];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness.toString(),
    bondAmount: marketParamsRaw.bondAmount.toString(),
  };
  updatedMarket.marketParams = marketParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

export const createOrUpdateEpochFromContract = async (
  marketInfo: MarketInfo,
  market: Market,
  epochId?: number
) => {
  const functionName = epochId ? "getEpoch" : "getLatestEpoch";
  const args = epochId ? [epochId] : [];

  const client = getProviderForChain(marketInfo.marketChainId);
  // get epoch from contract
  const epochReadResult: any = await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: marketInfo.deployment.abi,
    functionName,
    args,
  });
  const epochData: EpochData = epochReadResult[0];
  console.log("epochReadResult", epochReadResult);
  const _epochId = epochId || Number(epochData.epochId);

  // check if epoch already exists in db
  let existingEpoch = await epochRepository.findOne({
    where: {
      market: { address: marketInfo.deployment.address },
      epochId: _epochId,
    },
  });
  const updatedEpoch = existingEpoch || new Epoch();

  updatedEpoch.epochId = _epochId;
  updatedEpoch.startTimestamp = Number(epochData.startTime.toString());
  updatedEpoch.endTimestamp = Number(epochData.endTime.toString());
  updatedEpoch.settled = epochData.settled;
  updatedEpoch.settlementPriceD18 = epochData.settlementPriceD18.toString();
  updatedEpoch.baseAssetMinPriceTick = epochData.baseAssetMinPriceTick;
  updatedEpoch.baseAssetMaxPriceTick = epochData.baseAssetMaxPriceTick;
  updatedEpoch.maxPriceD18 = epochData.maxPriceD18.toString();
  updatedEpoch.minPriceD18 = epochData.minPriceD18.toString();
  const marketParamsRaw = epochReadResult[1];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness.toString(),
    bondAmount: marketParamsRaw.bondAmount.toString(),
  };
  updatedEpoch.market = market;
  updatedEpoch.marketParams = marketParams;
  await epochRepository.save(updatedEpoch);
  console.log("saved epoch:", updatedEpoch);
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
  if (eventArgs.initialOwner) {
    market.owner = eventArgs.initialOwner;
  }
  market.marketParams = {
    ...eventArgs.marketParams,
    feeRate: Number(eventArgs.marketParams.feeRate),
    assertionLiveness: eventArgs?.marketParams?.assertionLiveness.toString(),
    bondAmount: eventArgs?.marketParams?.bondAmount.toString(),
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
  event: Event,
  epochId: number
) => {
  newTransaction.type = TransactionType.REMOVE_LIQUIDITY;

  const eventArgs = event.logData.args as LiquidityPositionClosedEventLog;
  const originalPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgs.positionId),
      epoch: {
        epochId,
        market: { address: event.market.address },
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
  epochId: number,
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
        epochId,
        market: { address: event.market.address },
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
  event: Event,
  epochId: number
) => {
  const eventArgsCreateTrade = event.logData.args as TradePositionEventLog;
  newTransaction.type = getTradeTypeFromEvent(
    event.logData.args as TradePositionEventLog
  );

  const initialPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgsCreateTrade.positionId),
      epoch: {
        epochId,
        market: { address: event.market.address },
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

export const updateTransactionFromPositionSettledEvent = async (
  newTransaction: Transaction,
  event: Event,
  epochId: number
) => {
  const eventArgs = event.logData.args as PositionSettledEventLog;
  newTransaction.type = TransactionType.SETTLE_POSITION;

  const initialPosition = await positionRepository.findOne({
    where: {
      positionId: Number(eventArgs.positionId),
      epoch: {
        epochId,
        market: { address: event.market.address },
      },
    },
    relations: ["epoch"],
  });

  const baseTokenInitial = initialPosition?.baseToken || "0";
  const quoteTokenInitial = initialPosition?.quoteToken || "0";
  const settlementPriceD18 = initialPosition?.epoch.settlementPriceD18 || "0";

  newTransaction.baseTokenDelta = (-BigInt(baseTokenInitial)).toString();
  newTransaction.quoteTokenDelta = (-BigInt(quoteTokenInitial)).toString();
  newTransaction.collateralDelta = BigInt(
    eventArgs.withdrawableCollateral
  ).toString();
  newTransaction.tradeRatioD18 = settlementPriceD18;
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
  newEpoch.startTimestamp = Number(eventArgs.startTime);
  newEpoch.endTimestamp = Number(eventArgs.endTime);
  newEpoch.startingSqrtPriceX96 = eventArgs.startingSqrtPriceX96;
  newEpoch.marketParams = market.marketParams;

  const epoch = await epochRepository.save(newEpoch);
  return epoch;
};

export const getMarketStartEndBlock = async (
  market: Market,
  epochId: string,
  overrideClient?: PublicClient
) => {
  const epoch = await epochRepository.findOne({
    where: { market: { id: market.id }, epochId: Number(epochId) },
  });

  if (!epoch) {
    return { error: "Epoch not found" };
  }

  const now = Math.floor(Date.now() / 1000);
  const startTimestamp = Number(epoch.startTimestamp);
  const endTimestamp = Math.min(Number(epoch.endTimestamp), now);

  // Get the client for the specified chain ID
  const client = overrideClient || getProviderForChain(market.chainId);

  // Get the blocks corresponding to the start and end timestamps
  const startBlock = await getBlockByTimestamp(client, startTimestamp);
  let endBlock = await getBlockByTimestamp(client, endTimestamp);
  if (!endBlock) {
    endBlock = await client.getBlock();
  }

  if (!startBlock?.number || !endBlock?.number) {
    return {
      error: "Unable to retrieve block numbers for start or end timestamps",
    };
  }

  const startBlockNumber = Number(startBlock.number);
  const endBlockNumber = Number(endBlock.number);
  return { startBlockNumber, endBlockNumber };
};

// TODO: implement this
export const handlePositionUpdatedEvent = async (transaction: Transaction) => {
  const event = transaction.event;
  const eventArgs = event.logData.args as PositionUpdatedEventLog;
  const epochId = eventArgs.epochId;
  const chainId = event.market.chainId;
  const address = event.market.address;

  const existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(event.logData.args.positionId),
      epoch: {
        market: {
          address,
          chainId,
        },
        epochId: Number(epochId),
      },
    },
    relations: [
      "transactions",
      "epoch",
      "epoch.market",
      "transactions.event",
      "transactions.marketPrice",
    ],
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

  const epoch = await epochRepository.findOne({
    where: {
      epochId: Number(epochId),
      market: {
        address: event.market.address,
        chainId: event.market.chainId,
      },
    },
  });
  if (!epoch) {
    console.error(
      "Epoch not found: ",
      epochId,
      "market:",
      transaction.event.market.address
    );
    return;
  }

  const position = existingPosition || new Position();

  position.isLP = isLpPositionFromPositionUpdatedEvent(
    eventArgs.transactionType
  );
  position.positionId = Number(eventArgs.positionId);
  position.owner = eventArgs.sender || position.owner;

  position.baseToken = eventArgs.vGasAmount?.toString();
  position.quoteToken = eventArgs.vEthAmount?.toString();
  position.borrowedBaseToken = eventArgs.borrowedVGas?.toString();
  position.borrowedQuoteToken = eventArgs.borrowedVEth?.toString();

  position.collateral = eventArgs.collateralAmount?.toString();

  console.log("Saving position: ", position);
  await positionRepository.save(position);

  // Create a new Event entity
  const collateralTransfer = new CollateralTransfer();
  collateralTransfer.market = market;
  collateralTransfer.owner = position.owner;
  collateralTransfer.collateral = eventArgs.deltaCollateral;
  collateralTransfer.timestamp = Number(event.timestamp || "0");
  collateralTransfer.blockNumber = Number(event.blockNumber || 0);
  collateralTransfer.logIndex = event.logIndex || 0;

  console.log("Saving new collateral transfer event..");
  await collateralTransferRepository.save(collateralTransfer);
};

const isLpPositionFromPositionUpdatedEvent = (
  transactionType: EventTransactionType
) => {
  return (
    transactionType === EventTransactionType.CreateLiquidityPosition ||
    transactionType === EventTransactionType.IncreaseLiquidityPosition ||
    transactionType === EventTransactionType.DecreaseLiquidityPosition ||
    transactionType === EventTransactionType.CloseLiquidityPosition ||
    transactionType === EventTransactionType.DepositCollateral
  );
};
