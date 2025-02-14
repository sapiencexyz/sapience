import 'tsconfig-paths/register';
import {
  epochRepository,
  marketPriceRepository,
  marketRepository,
  positionRepository,
  collateralTransferRepository,
} from '../db';
import { Event } from '../models/Event';
import { MarketParams } from '../models/MarketParams';
import { Market } from '../models/Market';
import { Epoch } from '../models/Epoch';
import { Position } from '../models/Position';
import { Transaction, TransactionType } from '../models/Transaction';
import { CollateralTransfer } from '../models/CollateralTransfer';
import { PublicClient } from 'viem';
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  TradePositionEventLog,
  MarketInfo,
  EpochData,
  EventType,
} from '../interfaces';
import { MarketPrice } from '../models/MarketPrice';
import { getBlockByTimestamp, getProviderForChain } from '../utils';
import { FindOptionsWhere } from 'typeorm';

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (event: Event) => {
  const { to, tokenId } = event.logData.args;

  const existingPosition = await positionRepository.findOne({
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
    console.log('Position not found for transfer event: ', event);
    return;
  }

  existingPosition.owner = to as string;
  await positionRepository.save(existingPosition);
  console.log(`Updated owner of position ${tokenId} to ${to}`);
};

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handlePositionSettledEvent = async (event: Event) => {
  const { positionId } = event.logData.args;

  const existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(positionId),
    },
  });

  if (!existingPosition) {
    // Ignore the settled event until the position is created from another event
    console.log('Position not found for settled event: ', event);
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

  const epoch = await epochRepository.findOne({
    where: {
      epochId: Number(epochId),
      market: { address: transaction.event.market.address },
    },
  });
  if (!epoch) {
    console.error(
      'Epoch not found: ',
      epochId,
      'market:',
      transaction.event.market.address
    );
    return;
  }

  const existingPosition = await positionRepository.findOne({
    where: {
      epoch: {
        epochId: Number(epochId),
        market: { address: transaction.event.market.address },
      },
      positionId: Number(transaction.event.logData.args.positionId),
    },
    relations: [
      'transactions',
      'epoch',
      'epoch.market',
      'transactions.event',
      'transactions.marketPrice',
      'transactions.collateralTransfer',
    ],
  });

  const position = existingPosition || new Position();

  if (existingPosition) {
    console.log('existing position: ', existingPosition);
  }

  position.positionId = Number(eventArgs.positionId);
  position.epoch = epoch;
  position.owner = (eventArgs.sender as string) || position.owner;
  position.isLP = isLpPosition(transaction);
  position.transactions = position.transactions || [];
  position.transactions.push(transaction);

  // Latest position state
  position.baseToken = eventArgs.positionVgasAmount as string;
  position.quoteToken = eventArgs.positionVethAmount as string;
  position.borrowedBaseToken = eventArgs.positionBorrowedVgas as string;
  position.borrowedQuoteToken = eventArgs.positionBorrowedVeth as string;
  position.collateral = eventArgs.positionCollateralAmount as string;

  // LP Position state
  position.lpBaseToken =
    (eventArgs.loanAmount0 as string) ||
    (eventArgs.addedAmount0 as string) ||
    '0';
  position.lpQuoteToken =
    (eventArgs.loanAmount1 as string) ||
    (eventArgs.addedAmount1 as string) ||
    '0';

  // LP Position configuration
  if (eventArgs.upperTick && eventArgs.lowerTick) {
    position.highPriceTick = eventArgs.upperTick.toString();
    position.lowPriceTick = eventArgs.lowerTick.toString();
  }

  // Non-setted position data
  // position.owner = ;
  // position.settled = ;

  console.log('Saving position: ', position);
  await positionRepository.save(position);
};

const updateTransactionStateFromEvent = (
  transaction: Transaction,
  event: Event
) => {
  const eventArgs = event.logData.args;
  // Latest position state
  transaction.baseToken = eventArgs.positionVgasAmount as string;
  transaction.quoteToken = eventArgs.positionVethAmount as string;
  transaction.borrowedBaseToken = eventArgs.positionBorrowedVgas as string;
  transaction.borrowedQuoteToken = eventArgs.positionBorrowedVeth as string;

  transaction.collateral = eventArgs.positionCollateralAmount as string;

  if (eventArgs.tradeRatio) {
    transaction.tradeRatioD18 = eventArgs.tradeRatio as string;
  }
};

/**
 * Upsert a CollateralTransfer given a Transaction.
 * @param transaction the Transaction to upsert a CollateralTransfer for
 */
export const insertCollateralTransfer = async (transaction: Transaction) => {
  const eventArgs = transaction.event.logData.args;

  if (!eventArgs.deltaCollateral || eventArgs.deltaCollateral == '0') {
    console.log(
      'Delta collateral not found in eventArgs',
      eventArgs.deltaCollateral
    );
    return;
  }

  console.log('Upserting delta colalteral for transaction: ', transaction);
  // upsert market price
  const newCollateralTransfer = new CollateralTransfer();

  newCollateralTransfer.owner = transaction.event.logData.args.sender as string;
  newCollateralTransfer.transaction = transaction;
  newCollateralTransfer.transactionHash = transaction.event.transactionHash;

  newCollateralTransfer.collateral = eventArgs.deltaCollateral as string;
  newCollateralTransfer.timestamp = Number(transaction.event.timestamp);

  // Ensure the transaction has a collateralTransfer reference
  transaction.collateralTransfer = newCollateralTransfer;

  console.log('upserting collateral transfer: ', newCollateralTransfer);
  await collateralTransferRepository.save(newCollateralTransfer);
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
    console.log('Upserting market price for transaction: ', transaction);
    // upsert market price
    const newMp = new MarketPrice(); // might already get saved when upserting txn
    const finalPrice = transaction.event.logData.args.finalPrice;
    newMp.value = finalPrice as string;
    newMp.timestamp = transaction.event.timestamp;
    newMp.transaction = transaction;

    // Ensure the transaction has a marketPrice reference
    transaction.marketPrice = newMp;

    console.log('upserting market price: ', newMp);
    await marketPriceRepository.save(newMp);
  }
};

export const createOrUpdateMarketFromContract = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  initialMarket?: Market
) => {
  const address = contractDeployment.address.toLowerCase();
  // get market and epoch from contract
  const marketReadResult = await client.readContract({
    address: address as `0x${string}`,
    abi: contractDeployment.abi,
    functionName: 'getMarket',
  });
  console.log('marketReadResult', marketReadResult);

  let updatedMarket = initialMarket;
  if (!updatedMarket) {
    // check if market already exists in db
    const existingMarket = await marketRepository.findOne({
      where: { address, chainId },
      relations: ['epochs'],
    });
    updatedMarket = existingMarket || new Market();
  }

  // update market params appropriately
  updatedMarket.address = address;
  updatedMarket.deployTxnBlockNumber = Number(
    contractDeployment.deployTxnBlockNumber
  );
  updatedMarket.deployTimestamp = Number(contractDeployment.deployTimestamp);
  updatedMarket.chainId = chainId;
  updatedMarket.owner = (marketReadResult as MarketReadResult)[0];
  updatedMarket.collateralAsset = (marketReadResult as MarketReadResult)[1];
  const marketParamsRaw = (marketReadResult as MarketReadResult)[4];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw.bondAmount?.toString() ?? '0',
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
  const functionName = epochId ? 'getEpoch' : 'getLatestEpoch';
  const args = epochId ? [epochId] : [];

  const client = getProviderForChain(marketInfo.marketChainId);
  // get epoch from contract
  const epochReadResult = await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: marketInfo.deployment.abi,
    functionName,
    args,
  });
  const epochData: EpochData = (epochReadResult as EpochReadResult)[0];
  console.log('epochReadResult', epochReadResult);
  const _epochId = epochId || Number(epochData.epochId);

  // check if epoch already exists in db
  const existingEpoch = await epochRepository.findOne({
    where: {
      market: { address: marketInfo.deployment.address },
      epochId: _epochId,
    } satisfies FindOptionsWhere<Epoch>,
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
  const marketParamsRaw = (epochReadResult as EpochReadResult)[1];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw.bondAmount?.toString() ?? '0',
  };
  updatedEpoch.market = market;
  updatedEpoch.marketParams = marketParams;
  await epochRepository.save(updatedEpoch);
  console.log('saved epoch:', updatedEpoch);
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
  const market = originalMarket || new Market();
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
 * Updates a Transaction with the relevant information from a LiquidityPositionCreatedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionCreatedEventLog args
 */
export const updateTransactionFromAddLiquidityEvent = (
  newTransaction: Transaction,
  event: Event
) => {
  newTransaction.type = TransactionType.ADD_LIQUIDITY;

  updateTransactionStateFromEvent(newTransaction, event);

  newTransaction.lpBaseDeltaToken = event.logData.args.addedAmount0 as string;
  newTransaction.lpQuoteDeltaToken = event.logData.args.addedAmount1 as string;
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

  updateTransactionStateFromEvent(newTransaction, event);

  newTransaction.lpBaseDeltaToken = event.logData.args
    .collectedAmount0 as string;
  newTransaction.lpQuoteDeltaToken = event.logData.args
    .collectedAmount1 as string;
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

  updateTransactionStateFromEvent(newTransaction, event);

  newTransaction.lpBaseDeltaToken = isDecrease
    ? (
        BigInt((event.logData.args.decreasedAmount0 as string) ?? '0') *
        BigInt(-1)
      ).toString()
    : (event.logData.args.increasedAmount0 as string);
  newTransaction.lpQuoteDeltaToken = isDecrease
    ? (
        BigInt((event.logData.args.decreasedAmount1 as string) ?? '0') *
        BigInt(-1)
      ).toString()
    : (event.logData.args.increasedAmount1 as string);
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
  const args = event.logData.args as Record<string, string>;
  newTransaction.type = getTradeTypeFromEvent({
    finalPrice: args.finalPrice || '0',
    initialPrice: args.initialPrice || '0',
  } as TradePositionEventLog);

  updateTransactionStateFromEvent(newTransaction, event);
};

export const updateTransactionFromPositionSettledEvent = async (
  newTransaction: Transaction,
  event: Event
) => {
  const epochId = event.logData.args.epochId;
  newTransaction.type = TransactionType.SETTLE_POSITION;

  const epoch = await epochRepository.findOne({
    where: {
      epochId: Number(epochId),
      market: { address: event.market.address },
    } satisfies FindOptionsWhere<Epoch>,
  });

  if (!epoch) {
    throw new Error(`Epoch not found: ${epochId}`);
  }

  updateTransactionStateFromEvent(newTransaction, event);
  newTransaction.tradeRatioD18 = epoch?.settlementPriceD18 || '0';
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


export const getMarketStartEndBlockByTimestamps = async (
  market: Market,
  epochId: string,
  startTimestamp: number,
  endTimestamp: number,
  overrideClient?: PublicClient
) => {
  const epoch = await epochRepository.findOne({
    where: { market: { id: market.id }, epochId: Number(epochId) },
  });

  if (!epoch) {
    return { error: 'Epoch not found' };
  }

  const now = Math.floor(Date.now() / 1000);
  const startTimestampEpoch = Number(epoch.startTimestamp);
  const endTimestampEpoch = Math.min(Number(epoch.endTimestamp), now);

  if (startTimestamp < startTimestampEpoch || endTimestampEpoch < endTimestamp) {
    return {
      error: `Bad timestamp range specified; epoch bounds are ${startTimestampEpoch} and ${endTimestampEpoch}, timestamps specified are ${startTimestamp} and ${endTimestamp}`,
    };
  }

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
      error: 'Unable to retrieve block numbers for start or end timestamps',
    };
  }

  const startBlockNumber = Number(startBlock.number);
  const endBlockNumber = Number(endBlock.number);
  return { startBlockNumber, endBlockNumber };
};

export const getMarketStartEndBlock = async (
  market: Market,getMissingBlocks
  epochId: string,
  overrideClient?: PublicClient
) => {
  const epoch = await epochRepository.findOne({
    where: { market: { id: market.id }, epochId: Number(epochId) },
  });

  if (!epoch) {
    return { error: 'Epoch not found' };
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
      error: 'Unable to retrieve block numbers for start or end timestamps',
    };
  }

  const startBlockNumber = Number(startBlock.number);
  const endBlockNumber = Number(endBlock.number);
  return { startBlockNumber, endBlockNumber };
};

const isLpPosition = (transaction: Transaction) => {
  if (transaction.type === TransactionType.ADD_LIQUIDITY) {
    return true;
  } else if (transaction.type === TransactionType.REMOVE_LIQUIDITY) {
    // for remove liquidity, check if the position closed and kind is 2, which means it becomes a trade position
    const eventName = transaction.event.logData.eventName;
    if (
      eventName === EventType.LiquidityPositionClosed &&
      `${transaction.event.logData.args.kind}` === '2'
    ) {
      return false;
    }
    return true;
  }
  return false;
};

// Define contract return types as tuples with specific types
type MarketReadResult = readonly [
  owner: string,
  collateralAsset: string,
  paused: boolean,
  initialized: boolean,
  marketParams: MarketParams,
];

type EpochReadResult = readonly [
  epochData: EpochData,
  marketParams: MarketParams,
];
