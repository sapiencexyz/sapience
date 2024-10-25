import "tsconfig-paths/register";
import {
  epochRepository,
  marketPriceRepository,
  marketRepository,
  positionRepository,
  resourcePriceRepository,
} from "../db";
import { Event } from "../models/Event";
import { EpochParams } from "../models/EpochParams";
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
  MarketInfo,
} from "../interfaces";
import { MarketPrice } from "../models/MarketPrice";
import { getBlockByTimestamp, getProviderForChain } from "../helpers";
import { ResourcePrice } from "../models/ResourcePrice";
import { LessThanOrEqual } from "typeorm";
import { MARKET_INFO } from "src/constants";

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
  const { positionId, withdrawnCollateral } = event.logData.args;

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
export const createOrModifyPosition = async (transaction: Transaction) => {
  const eventArgs = transaction.event.logData.args; //as LiquidityPositionModifiedEventLog;
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

  const originalCollateral = existingPosition
    ? existingPosition.collateral
    : "0";
  const position = existingPosition || new Position();

  if (existingPosition) {
    console.log("existing position: ", existingPosition);
  }
  console.log("eventArgs: =", eventArgs);

  position.isLP = isLpPosition(transaction);
  position.positionId = Number(eventArgs.positionId);
  position.owner = eventArgs.sender || position.owner;
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
  ).toString();
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
  const epochParamsRaw = marketReadResult[4];
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
  const _epochId = epochId || Number(epochReadResult[0]);

  // check if epoch already exists in db
  let existingEpoch = await epochRepository.findOne({
    where: {
      market: { address: marketInfo.deployment.address },
      epochId: _epochId,
    },
  });
  const updatedEpoch = existingEpoch || new Epoch();

  const idxAdjustment = epochId ? 0 : 1; // getLatestEpoch returns and extra param at 0 index

  updatedEpoch.epochId = _epochId;
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
  newEpoch.epochParams = market.epochParams;

  const epoch = await epochRepository.save(newEpoch);
  return epoch;
};

export const initializeResourcePriceForEpoch = async (
  eventArgs: EpochCreatedEventLog,
  market: Market
) => {
  // find most recent resource price before startTimestamp
  const previousResourcePrice = await resourcePriceRepository.findOne({
    where: {
      market: { id: market.id },
      timestamp: LessThanOrEqual(Number(eventArgs.startTime)),
    },
    order: {
      timestamp: "DESC",
    },
  });

  if (!previousResourcePrice) {
    // add a resource price via contract lookup
    const marketInfo = MARKET_INFO.find(
      (m) =>
        m.marketChainId === market.chainId &&
        m.deployment.address.toLowerCase() === market.address.toLowerCase()
    );
    if (!marketInfo) {
      // TODO: just default to use priceIndexer = new evmIndexer(mainnet.id)?
      throw new Error(
        `Could not find market info for chainId ${market.chainId} and address ${market.address} to create resource price`
      );
    }
    await marketInfo.priceIndexer.indexBlockPriceAtTimestamp(
      market,
      Number(eventArgs.startTime)
    );
  } else {
    const resourcePrice = new ResourcePrice();
    resourcePrice.market = market;
    resourcePrice.timestamp = Number(eventArgs.startTime);
    resourcePrice.value = previousResourcePrice.value;
    resourcePrice.blockNumber = previousResourcePrice.blockNumber;

    await resourcePriceRepository.upsert(resourcePrice, [
      "market",
      "timestamp",
    ]);
  }
};

export const getMarketStartEndBlock = async (
  market: Market,
  epochId: string
) => {
  // Find the epoch within the market
  const epoch = await epochRepository.findOne({
    where: {
      market: { id: market.id },
      epochId: Number(epochId),
    },
  });

  if (!epoch) {
    return { error: "Epoch not found" };
  }

  // Get start and end timestamps
  const startTimestamp = Number(epoch.startTimestamp);
  const now = Math.floor(Date.now() / 1000);
  const endTimestamp = Math.min(Number(epoch.endTimestamp), now);

  console.log("startTimestamp", startTimestamp);
  console.log("endTimestamp", endTimestamp);

  // Get the client for the specified chain ID
  const client = getProviderForChain(market.chainId);

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
