import 'tsconfig-paths/register';
import {
  marketRepository,
  marketPriceRepository,
  marketGroupRepository,
  positionRepository,
  collateralTransferRepository,
} from '../db';
import { Event } from '../models/Event';
import { MarketParams } from '../models/MarketParams';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';
import { Position } from '../models/Position';
import { Transaction, TransactionType } from '../models/Transaction';
import { CollateralTransfer } from '../models/CollateralTransfer';
import { PublicClient, erc20Abi } from 'viem';
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  TradePositionEventLog,
  EpochData,
  EventType,
} from '../interfaces';
import { MarketPrice } from '../models/MarketPrice';
import { getBlockByTimestamp, getProviderForChain } from '../utils';
import { FindOptionsWhere } from 'typeorm';
import Foil from '@foil/protocol/deployments/Foil.json';

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (event: Event) => {
  const { to, tokenId } = event.logData.args;

  const existingPosition = await positionRepository.findOne({
    where: {
      positionId: Number(tokenId),
      market: {
        marketGroup: {
          address: event.marketGroup.address.toLowerCase(),
          chainId: event.marketGroup.chainId,
        },
      },
    },
  });

  if (!existingPosition) {
    // Ignore the transfer event until the position is created from another event
    console.log('Position not found for transfer event: ', event);
    return;
  }

  existingPosition.owner = (to as string).toLowerCase();
  await positionRepository.save(existingPosition);
  console.log(`Updated owner of position ${tokenId} to ${to}`);
};

/**
 * Handles a PositionSettled event by updating the isSettled flag of the corresponding Position.
 * @param event The PositionSettled event
 */
export const handlePositionSettledEvent = async (event: Event) => {
  const { positionId } = event.logData.args;
  
  if (!positionId) {
    console.error('No positionId found in PositionSettled event args:', event.logData.args);
    return;
  }

  try {
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
  } catch (error) {
    console.error('Error handling PositionSettled event:', error);
  }
};

/**
 * Creates or modifies a Position in the database based on the given Transaction.
 * @param transaction the Transaction to use for creating/modifying the position
 */
export const createOrModifyPositionFromTransaction = async (
  transaction: Transaction
) => {
  try {
    const eventArgs = transaction.event.logData.args;
    const epochId = eventArgs.epochId;

    if (!epochId) {
      console.error('No epochId found in event args:', eventArgs);
      return;
    }

    const epoch = await marketRepository.findOne({
      where: {
        marketId: Number(epochId),
        marketGroup: {
          address: transaction.event.marketGroup.address.toLowerCase(),
        },
      },
    });
    if (!epoch) {
      console.error(
        'Epoch not found: ',
        epochId,
        'market:',
        transaction.event.marketGroup.address
      );
      return;
    }

    const positionId = Number(transaction.event.logData.args.positionId);
    if (isNaN(positionId)) {
      console.error(
        'Invalid positionId:',
        transaction.event.logData.args.positionId
      );
      return;
    }

    const existingPosition = await positionRepository.findOne({
      where: {
        market: {
          marketId: Number(epochId),
          marketGroup: {
            address: transaction.event.marketGroup.address.toLowerCase(),
          },
        },
        positionId: positionId,
      },
      relations: [
        'transactions',
        'market',
        'market.marketGroup',
        'transactions.event',
        'transactions.marketPrice',
        'transactions.collateralTransfer',
      ],
    });

    // Create a new position or use the existing one
    const position = existingPosition || new Position();

    if (existingPosition) {
      console.log('Found existing position:', existingPosition.id);
    } else {
      console.log('Creating new position for positionId:', positionId);
    }

    // Set all required fields explicitly
    position.positionId = positionId;
    position.market = epoch;
    position.owner = (
      (eventArgs.sender as string) ||
      position.owner ||
      ''
    ).toLowerCase();
    position.isLP = isLpPosition(transaction);

    // Initialize transactions array if it doesn't exist
    if (!position.transactions) {
      position.transactions = [];
    }

    // Add the current transaction to the position's transactions
    // Check if the transaction is already in the array to avoid duplicates
    const transactionExists = position.transactions.some(
      (t) => t.id === transaction.id
    );
    if (!transactionExists) {
      position.transactions.push(transaction);

      // Update the transaction with a reference to this position
      // But don't save it here - it will be saved by the caller
      transaction.position = position;
    }

    // Latest position state - ensure all fields have values
    position.baseToken = (eventArgs.positionVgasAmount as string) || '0';
    position.quoteToken = (eventArgs.positionVethAmount as string) || '0';
    position.borrowedBaseToken =
      (eventArgs.positionBorrowedVgas as string) || '0';
    position.borrowedQuoteToken =
      (eventArgs.positionBorrowedVeth as string) || '0';
    position.collateral = (eventArgs.positionCollateralAmount as string) || '0';

    // LP Position state - ensure all fields have values
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
    } else {
      // Ensure these fields have default values if not set
      if (!position.highPriceTick) position.highPriceTick = '0';
      if (!position.lowPriceTick) position.lowPriceTick = '0';
    }

    // Ensure isSettled has a default value
    if (position.isSettled === undefined || position.isSettled === null) {
      position.isSettled = false;
    }

    console.log('Saving position: ', position.id || 'new');

    // Use save method which handles both insert and update
    const savedPosition = await positionRepository.save(position);
    console.log('Position saved successfully:', savedPosition.id);

    return savedPosition;
  } catch (error) {
    console.error('Error in createOrModifyPositionFromTransaction:', error);
    throw error;
  }
};

const updateTransactionStateFromEvent = (
  transaction: Transaction,
  event: Event
) => {
  const eventArgs = event.logData.args;
  // Latest position state
  transaction.baseToken = (eventArgs.positionVgasAmount as string) || '0';
  transaction.quoteToken = (eventArgs.positionVethAmount as string) || '0';
  transaction.borrowedBaseToken =
    (eventArgs.positionBorrowedVgas as string) || '0';
  transaction.borrowedQuoteToken =
    (eventArgs.positionBorrowedVeth as string) || '0';
  transaction.collateral =
    (eventArgs.positionCollateralAmount as string) || '0';

  if (eventArgs.tradeRatio) {
    transaction.tradeRatioD18 = eventArgs.tradeRatio as string;
  }
};

/**
 * Find or create a CollateralTransfer for a Transaction.
 * @param transaction the Transaction to find or create a CollateralTransfer for
 */
export const insertCollateralTransfer = async (transaction: Transaction) => {
  const eventArgs = transaction.event.logData.args;

  if (!eventArgs.deltaCollateral || eventArgs.deltaCollateral == '0') {
    console.log('Delta collateral not found in eventArgs');
    return;
  }

  // Check if a collateral transfer already exists for this transaction hash
  const existingTransfer = await collateralTransferRepository.findOne({
    where: { transactionHash: transaction.event.transactionHash },
  });

  if (existingTransfer) {
    // If it exists, just use it
    transaction.collateralTransfer = existingTransfer;
    return;
  }

  // Create a new one if it doesn't exist
  const transfer = new CollateralTransfer();
  transfer.transactionHash = transaction.event.transactionHash;
  transfer.timestamp = Number(transaction.event.timestamp);
  transfer.owner = (
    transaction.event.logData.args.sender as string
  ).toLowerCase();
  transfer.collateral = eventArgs.deltaCollateral as string;

  // Save and assign to transaction
  try {
    const savedTransfer = await collateralTransferRepository.save(transfer);
    transaction.collateralTransfer = savedTransfer;
  } catch (error) {
    // If we get a duplicate key error, try to find the existing transfer again
    // This handles race conditions
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      const retryTransfer = await collateralTransferRepository.findOne({
        where: { transactionHash: transaction.event.transactionHash },
      });
      if (retryTransfer) {
        transaction.collateralTransfer = retryTransfer;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
};

/**
 * Create a MarketPrice for a Transaction.
 * @param transaction the Transaction to create a MarketPrice for
 */
export const insertMarketPrice = async (transaction: Transaction) => {
  if (
    transaction.type === TransactionType.LONG ||
    transaction.type === TransactionType.SHORT
  ) {
    // Create a new market price
    const newMp = new MarketPrice();
    const finalPrice = transaction.event.logData.args.finalPrice as string;
    newMp.value = finalPrice;
    newMp.timestamp = transaction.event.timestamp;

    // Save and assign to transaction
    try {
      const savedMp = await marketPriceRepository.save(newMp);
      transaction.marketPrice = savedMp;
    } catch (error) {
      console.error('Error saving market price:', error);
      throw error;
    }
  }
};

export const createOrUpdateMarketFromContract = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  initialMarket?: MarketGroup
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
    const existingMarket = await marketGroupRepository.findOne({
      where: { address: address.toLowerCase(), chainId },
      relations: ['markets'],
    });
    updatedMarket = existingMarket || new MarketGroup();
  }

  // update market params appropriately
  updatedMarket.address = address.toLowerCase();
  updatedMarket.deployTxnBlockNumber = Number(
    contractDeployment.deployTxnBlockNumber
  );
  updatedMarket.deployTimestamp = Number(contractDeployment.deployTimestamp);
  updatedMarket.chainId = chainId;
  updatedMarket.owner = (
    (marketReadResult as MarketReadResult)[0] as string
  ).toLowerCase();
  updatedMarket.collateralAsset = (marketReadResult as MarketReadResult)[1];
  if (updatedMarket.collateralAsset) {
    try {
      const decimals = await client.readContract({
        address: updatedMarket.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      updatedMarket.collateralDecimals = Number(decimals);
      const symbol = await client.readContract({
        address: updatedMarket.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      updatedMarket.collateralSymbol = symbol as string;
    } catch (error) {
      console.error(
        `Failed to fetch decimals or symbol for token ${updatedMarket.collateralAsset}:`,
        error
      );
    }
  }
  const marketParamsRaw = (marketReadResult as MarketReadResult)[4];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw.bondAmount?.toString() ?? '0',
  };
  updatedMarket.marketParams = marketParams;
  await marketGroupRepository.save(updatedMarket);
  return updatedMarket;
};

export const createOrUpdateEpochFromContract = async (
  market: MarketGroup,
  epochId?: number
) => {
  const functionName = epochId ? 'getEpoch' : 'getLatestEpoch';
  const args = epochId ? [epochId] : [];

  const client = getProviderForChain(market.chainId);
  // get epoch from contract
  const epochReadResult = await client.readContract({
    address: market.address as `0x${string}`,
    abi: Foil.abi,
    functionName,
    args,
  });
  const epochData: EpochData = (epochReadResult as EpochReadResult)[0];

  const _epochId = epochId || Number(epochData.epochId);

  // check if epoch already exists in db
  const existingEpoch = await marketRepository.findOne({
    where: {
      marketGroup: { address: market.address.toLowerCase() },
      marketId: _epochId,
    } satisfies FindOptionsWhere<Market>,
  });
  const updatedEpoch = existingEpoch || new Market();

  updatedEpoch.marketId = _epochId;
  updatedEpoch.startTimestamp = Number(epochData.startTime.toString());
  updatedEpoch.endTimestamp = Number(epochData.endTime.toString());
  updatedEpoch.settled = epochData.settled;
  updatedEpoch.settlementPriceD18 = epochData.settlementPriceD18.toString();
  updatedEpoch.baseAssetMinPriceTick = epochData.baseAssetMinPriceTick;
  updatedEpoch.baseAssetMaxPriceTick = epochData.baseAssetMaxPriceTick;
  updatedEpoch.maxPriceD18 = epochData.maxPriceD18.toString();
  updatedEpoch.minPriceD18 = epochData.minPriceD18.toString();
  updatedEpoch.poolAddress = epochData.pool;
  const marketParamsRaw = (epochReadResult as EpochReadResult)[1];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw.bondAmount?.toString() ?? '0',
  };
  updatedEpoch.marketGroup = market;
  updatedEpoch.marketParams = marketParams;
  await marketRepository.save(updatedEpoch);
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
  originalMarket?: MarketGroup | null
) => {
  const market = originalMarket || new MarketGroup();
  market.chainId = chainId;
  market.address = address.toLowerCase();
  if (eventArgs.collateralAsset) {
    market.collateralAsset = eventArgs.collateralAsset;
  }
  if (eventArgs.initialOwner) {
    market.owner = (eventArgs.initialOwner as string).toLowerCase();
  }
  market.marketParams = {
    ...eventArgs.marketParams,
    feeRate: Number(eventArgs.marketParams.feeRate),
    assertionLiveness: eventArgs?.marketParams?.assertionLiveness.toString(),
    bondAmount: eventArgs?.marketParams?.bondAmount.toString(),
  };
  const newMarket = await marketGroupRepository.save(market);
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

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken || newTransaction.baseToken === '') {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken || newTransaction.quoteToken === '') {
    newTransaction.quoteToken = '0';
  }

  if (
    !newTransaction.borrowedBaseToken ||
    newTransaction.borrowedBaseToken === ''
  ) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (
    !newTransaction.borrowedQuoteToken ||
    newTransaction.borrowedQuoteToken === ''
  ) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral || newTransaction.collateral === '') {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18 || newTransaction.tradeRatioD18 === '') {
    newTransaction.tradeRatioD18 = '0';
  }
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

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken || newTransaction.baseToken === '') {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken || newTransaction.quoteToken === '') {
    newTransaction.quoteToken = '0';
  }

  if (
    !newTransaction.borrowedBaseToken ||
    newTransaction.borrowedBaseToken === ''
  ) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (
    !newTransaction.borrowedQuoteToken ||
    newTransaction.borrowedQuoteToken === ''
  ) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral || newTransaction.collateral === '') {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18 || newTransaction.tradeRatioD18 === '') {
    newTransaction.tradeRatioD18 = '0';
  }
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

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken || newTransaction.baseToken === '') {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken || newTransaction.quoteToken === '') {
    newTransaction.quoteToken = '0';
  }

  if (
    !newTransaction.borrowedBaseToken ||
    newTransaction.borrowedBaseToken === ''
  ) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (
    !newTransaction.borrowedQuoteToken ||
    newTransaction.borrowedQuoteToken === ''
  ) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral || newTransaction.collateral === '') {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18 || newTransaction.tradeRatioD18 === '') {
    newTransaction.tradeRatioD18 = '0';
  }
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

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken || newTransaction.baseToken === '') {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken || newTransaction.quoteToken === '') {
    newTransaction.quoteToken = '0';
  }

  if (
    !newTransaction.borrowedBaseToken ||
    newTransaction.borrowedBaseToken === ''
  ) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (
    !newTransaction.borrowedQuoteToken ||
    newTransaction.borrowedQuoteToken === ''
  ) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral || newTransaction.collateral === '') {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18 && args.tradeRatio) {
    newTransaction.tradeRatioD18 = args.tradeRatio;
  } else if (!newTransaction.tradeRatioD18) {
    newTransaction.tradeRatioD18 = '0';
  }
};

export const updateTransactionFromPositionSettledEvent = async (
  newTransaction: Transaction,
  event: Event
) => {
  newTransaction.type = TransactionType.SETTLE_POSITION;

  // PositionSettled event doesn't include epochId, so we need to find it via the position
  const { positionId } = event.logData.args;
  
  // Find position in the database first
  const position = await positionRepository.findOne({
    where: {
      positionId: Number(positionId),
      // Don't filter by owner since the sender field might not be in the event
    },
    relations: ['market', 'market.marketGroup'],
  });

  if (!position) {
    console.error(`Position not found for PositionSettled event: positionId=${positionId}`);
    // Set default values even if position not found
    updateTransactionStateFromEvent(newTransaction, event);
    newTransaction.tradeRatioD18 = '0';
    setDefaultTransactionValues(newTransaction);
    return;
  }

  // Get the market/epoch from the position
  const epoch = position.market;
  
  if (!epoch) {
    console.error(`Epoch not found for position: ${positionId}`);
    updateTransactionStateFromEvent(newTransaction, event);
    newTransaction.tradeRatioD18 = '0';
    setDefaultTransactionValues(newTransaction);
    return;
  }

  // Verify this position belongs to the same market as the event
  if (epoch.marketGroup.address.toLowerCase() !== event.marketGroup.address.toLowerCase()) {
    console.error(`Position market mismatch: position market=${epoch.marketGroup.address}, event market=${event.marketGroup.address}`);
    // Try to find the correct epoch in this market
    const correctEpoch = await marketRepository.findOne({
      where: {
        marketGroup: { address: event.marketGroup.address.toLowerCase() },
      },
      order: { marketId: 'DESC' }, 
    });
    
    if (correctEpoch) {
      updateTransactionStateFromEvent(newTransaction, event);
      newTransaction.tradeRatioD18 = correctEpoch.settlementPriceD18 || '0';
      setDefaultTransactionValues(newTransaction);
      return;
    }
  }

  updateTransactionStateFromEvent(newTransaction, event);
  newTransaction.tradeRatioD18 = epoch?.settlementPriceD18 || '0';

  setDefaultTransactionValues(newTransaction);
};

// Extract this common code to a helper function to avoid duplication
const setDefaultTransactionValues = (transaction: Transaction) => {
  // Ensure all required fields have default values if not set
  if (!transaction.baseToken || transaction.baseToken === '') {
    transaction.baseToken = '0';
  }

  if (!transaction.quoteToken || transaction.quoteToken === '') {
    transaction.quoteToken = '0';
  }

  if (
    !transaction.borrowedBaseToken ||
    transaction.borrowedBaseToken === ''
  ) {
    transaction.borrowedBaseToken = '0';
  }

  if (
    !transaction.borrowedQuoteToken ||
    transaction.borrowedQuoteToken === ''
  ) {
    transaction.borrowedQuoteToken = '0';
  }

  if (!transaction.collateral || transaction.collateral === '') {
    transaction.collateral = '0';
  }
};

/**
 * Creates a new Epoch from a given event
 * @param eventArgs The event arguments from the EpochCreated event.
 * @param market The market associated with the epoch.
 * @returns The newly created or updated epoch.
 */
export const createEpochFromEvent = async (
  eventArgs: EpochCreatedEventLog,
  market: MarketGroup
) => {
  // first check if there's an existing epoch in the database before creating a new one
  const existingEpoch = await marketRepository.findOne({
    where: {
      marketId: Number(eventArgs.epochId),
      marketGroup: {
        address: market.address.toLowerCase(),
        chainId: market.chainId,
      },
    },
  });

  const newEpoch = existingEpoch || new Market();
  newEpoch.marketId = Number(eventArgs.epochId);
  newEpoch.marketGroup = market;
  newEpoch.startTimestamp = Number(eventArgs.startTime);
  newEpoch.endTimestamp = Number(eventArgs.endTime);
  newEpoch.startingSqrtPriceX96 = eventArgs.startingSqrtPriceX96;
  newEpoch.marketParams = market.marketParams;

  const epoch = await marketRepository.save(newEpoch);
  return epoch;
};

export const getMarketStartEndBlock = async (
  market: MarketGroup,
  epochId: string,
  overrideClient?: PublicClient
) => {
  const epoch = await marketRepository.findOne({
    where: { marketGroup: { id: market.id }, marketId: Number(epochId) },
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
