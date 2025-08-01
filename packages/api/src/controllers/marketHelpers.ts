import 'tsconfig-paths/register';
import prisma from '../db';
import { PublicClient, erc20Abi } from 'viem';
import { Decimal } from 'generated/prisma/runtime/library';
import type {
  Transaction,
  Event,
  Position,
  Market,
  MarketGroup,
} from '../../generated/prisma';
import { transaction_type_enum as TransactionType } from '../../generated/prisma';
import {
  MarketCreatedEventLog,
  MarketGroupCreatedUpdatedEventLog,
  TradePositionEventLog,
  MarketData,
  EventType,
  MarketParams,
} from '../interfaces';
import { getBlockByTimestamp, getProviderForChain } from '../utils/utils';
import Sapience from '@sapience/protocol/deployments/Sapience.json';

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (
  event: Event & { market_group: MarketGroup }
) => {
  const args = getLogDataArgs(event.logData);
  const { to, tokenId } = args;

  if (!to || !tokenId) {
    console.log('Missing required fields in transfer event:', Event);
    return;
  }

  const existingPosition = await prisma.position.findFirst({
    where: {
      positionId: Number(tokenId), // TODO: Check if this is correct, looks wrong. How tokenId from transfer event is related to positionId ?
      market: {
        market_group: {
          address: event.market_group.address?.toLowerCase(),
          chainId: event.market_group.chainId,
        },
      },
    },
  });

  if (!existingPosition) {
    // Ignore the transfer event until the position is created from another event
    console.log('Position not found for transfer event: ', event);
    return;
  }

  await prisma.position.update({
    where: { id: existingPosition.id },
    data: { owner: (to as string).toLowerCase() },
  });

  console.log(`Updated owner of position ${tokenId} to ${to}`);
};

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handlePositionSettledEvent = async (event: Event) => {
  const args = getLogDataArgs(event.logData);
  const { positionId } = args;

  if (!positionId) {
    console.log('Missing positionId in settled event:', Event);
    return;
  }

  const existingPosition = await prisma.position.findFirst({
    where: {
      positionId: Number(positionId),
    },
  });

  if (!existingPosition) {
    // Ignore the settled event until the position is created from another event
    console.log('Position not found for settled event: ', Event);
    return;
  }

  await prisma.position.update({
    where: { id: existingPosition.id },
    data: { isSettled: true },
  });

  console.log(`Updated isSettled state of position ${positionId} to true`);
};

/**
 * Creates or modifies a Position in the database based on the given Transaction.
 * @param transaction the Transaction to use for creating/modifying the position
 */
export const createOrModifyPositionFromTransaction = async (
  transaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  }
) => {
  try {
    const eventArgs = getLogDataArgs(transaction.event.logData);
    let marketId = eventArgs.marketId;
    let market: Market | undefined;

    if (!marketId) {
      const positionId = eventArgs.positionId;

      const markets = await prisma.market.findMany({
        where: {
          market_group: {
            address: transaction.event.market_group.address?.toLowerCase(),
            chainId: transaction.event.market_group.chainId,
          },
        },
        include: {
          position: true,
        },
      });

      let found = false;
      for (const currentMarket of markets) {
        const position = currentMarket.position.find(
          (p: Position) => p.positionId === Number(positionId)
        );
        if (position) {
          market = currentMarket;
          marketId = currentMarket.marketId;
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error(`Market not found for position id ${positionId}`);
      }
    } else {
      const foundMarket = await prisma.market.findFirst({
        where: {
          marketId: Number(marketId),
          market_group: {
            address: transaction.event.market_group.address?.toLowerCase(),
          },
        },
      });

      if (!foundMarket) {
        console.error(
          'Market not found: ',
          marketId,
          'market:',
          transaction.event.market_group.address
        );
        throw new Error(`Market not found: ${marketId}`);
      }
      market = foundMarket;
    }

    if (!market) {
      throw new Error('Market is undefined');
    }

    const positionId = Number(eventArgs.positionId);
    if (isNaN(positionId)) {
      console.error('Invalid positionId:', eventArgs.positionId);
      return;
    }

    const existingPosition = await prisma.position.findFirst({
      where: {
        market: {
          marketId: Number(marketId),
          market_group: {
            address: transaction.event.market_group.address?.toLowerCase(),
          },
        },
        positionId: positionId,
      },
      include: {
        transaction: {
          include: {
            event: true,
            market_price: true,
            collateral_transfer: true,
          },
        },
        market: {
          include: {
            market_group: true,
          },
        },
      },
    });

    let savedPosition: Position;

    if (existingPosition) {
      console.log('Found existing position:', existingPosition.id);

      // Update existing position
      savedPosition = await prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          positionId: positionId,
          marketId: market.id,
          owner: (
            (eventArgs.sender as string) ||
            existingPosition.owner ||
            ''
          ).toLowerCase(),
          isLP: isLpPosition(transaction),
          baseToken: String(eventArgs.positionVbaseAmount || '0'),
          quoteToken: String(eventArgs.positionVquoteAmount || '0'),
          borrowedBaseToken: String(eventArgs.positionBorrowedVbase || '0'),
          borrowedQuoteToken: String(eventArgs.positionBorrowedVquote || '0'),
          collateral: String(eventArgs.positionCollateralAmount || '0'),
          lpBaseToken: String(
            eventArgs.loanAmount0 || eventArgs.addedAmount0 || '0'
          ),
          lpQuoteToken: String(
            eventArgs.loanAmount1 || eventArgs.addedAmount1 || '0'
          ),
          highPriceTick: toDecimal(
            eventArgs.upperTick || existingPosition.highPriceTick || '0'
          ),
          lowPriceTick: toDecimal(
            eventArgs.lowerTick || existingPosition.lowPriceTick || '0'
          ),
          isSettled: existingPosition.isSettled ?? false,
        },
      });
    } else {
      console.log('Creating new position for positionId:', positionId);

      // Create new position
      savedPosition = await prisma.position.create({
        data: {
          positionId: positionId,
          marketId: market.id,
          owner: ((eventArgs.sender as string) || '').toLowerCase(),
          isLP: isLpPosition(transaction),
          baseToken: String(eventArgs.positionVbaseAmount || '0'),
          quoteToken: String(eventArgs.positionVquoteAmount || '0'),
          borrowedBaseToken: String(eventArgs.positionBorrowedVbase || '0'),
          borrowedQuoteToken: String(eventArgs.positionBorrowedVquote || '0'),
          collateral: String(eventArgs.positionCollateralAmount || '0'),
          lpBaseToken: String(
            eventArgs.loanAmount0 || eventArgs.addedAmount0 || '0'
          ),
          lpQuoteToken: String(
            eventArgs.loanAmount1 || eventArgs.addedAmount1 || '0'
          ),
          highPriceTick: toDecimal(eventArgs.upperTick || '0'),
          lowPriceTick: toDecimal(eventArgs.lowerTick || '0'),
          isSettled: false,
        },
      });
    }

    // Update the transaction to reference this position
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { positionId: savedPosition.id },
    });

    console.log('Position saved successfully:', savedPosition.id);
    return savedPosition;
  } catch (error) {
    console.error('Error in createOrModifyPositionFromTransaction:', error);
    throw error;
  }
};

const updateTransactionStateFromEvent = (
  transaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event
) => {
  const eventArgs = getLogDataArgs(event.logData);

  // Latest position state
  transaction.baseToken = String(eventArgs.positionVbaseAmount || '0');
  transaction.quoteToken = String(eventArgs.positionVquoteAmount || '0');
  transaction.borrowedBaseToken = String(eventArgs.positionBorrowedVbase || '0');
  transaction.borrowedQuoteToken = String(
    eventArgs.positionBorrowedVquote || '0'
  );
  transaction.collateral = String(eventArgs.positionCollateralAmount || '0');

  if (eventArgs.tradeRatio) {
    transaction.tradeRatioD18 = String(eventArgs.tradeRatio);
  }
};

/**
 * Find or create a CollateralTransfer for a Transaction.
 * @param transaction the Transaction to find or create a CollateralTransfer for
 */
export const insertCollateralTransfer = async (
  transaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  }
) => {
  const eventArgs = getLogDataArgs(transaction.event.logData);

  if (!eventArgs.deltaCollateral || eventArgs.deltaCollateral == '0') {
    console.log('Delta collateral not found in eventArgs');
    return;
  }

  // Check if a collateral transfer already exists for this transaction hash
  const existingTransfer = await prisma.collateralTransfer.findFirst({
    where: { transactionHash: transaction.event.transactionHash },
  });

  if (existingTransfer) {
    // If it exists, update the transaction to reference it
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { collateralTransferId: existingTransfer.id },
    });
    return;
  }

  // Create a new one if it doesn't exist
  const transfer = await prisma.collateralTransfer.create({
    data: {
      transactionHash: transaction.event.transactionHash,
      timestamp: Number(transaction.event.timestamp),
      owner: ((eventArgs.sender as string) || '').toLowerCase(),
      collateral: String(eventArgs.deltaCollateral),
    },
  });

  // Update transaction to reference the transfer
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { collateralTransferId: transfer.id },
  });
};

/**
 * Create a MarketPrice for a Transaction.
 * @param transaction the Transaction to create a MarketPrice for
 */
export const insertMarketPrice = async (
  transaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  }
) => {
  if (
    transaction.type === TransactionType.long ||
    transaction.type === TransactionType.short
  ) {
    const args = getLogDataArgs(transaction.event.logData);

    // Create a new market price
    const newMp = await prisma.marketPrice.create({
      data: {
        value: toDecimal(args.finalPrice || '0'),
        timestamp: transaction.event.timestamp,
      },
    });

    // Update transaction to reference the market price
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { marketPriceId: newMp.id },
    });
  }
};

/**
 * Updates the collateral decimals and symbol for a market.
 * @param client The provider client for the chain
 * @param market The market to update
 */
export const updateCollateralData = async (
  client: PublicClient,
  market: MarketGroup
) => {
  if (market.collateralAsset) {
    try {
      const decimals = await client.readContract({
        address: market.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      const symbol = await client.readContract({
        address: market.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol',
      });

      await prisma.marketGroup.update({
        where: { id: market.id },
        data: {
          collateralDecimals: Number(decimals),
          collateralSymbol: symbol as string,
        },
      });
    } catch (error) {
      console.error(
        `Failed to fetch decimals or symbol for token ${market.collateralAsset}:`,
        error
      );
    }
  }
};

export const createOrUpdateMarketFromContract = async (
  marketGroup: MarketGroup,
  marketId?: number
) => {
  const functionName = marketId ? 'getMarket' : 'getLatestMarket';
  const args = marketId ? [marketId] : [];

  const client = getProviderForChain(marketGroup.chainId);
  // get market from contract
  const marketReadResult = await client.readContract({
    address: marketGroup.address as `0x${string}`,
    abi: Sapience.abi,
    functionName,
    args,
  });
  const marketData: MarketData = (marketReadResult as MarketReadResult)[0];
  const marketGroupParams = (marketReadResult as MarketReadResult)[1];

  const _marketId = marketId || Number(marketData.marketId);

  // check if market already exists in db
  const existingMarket = await prisma.market.findFirst({
    where: {
      market_group: { address: marketGroup.address?.toLowerCase() },
      marketId: _marketId,
    },
  });

  if (existingMarket) {
    // Update existing market
    await prisma.market.update({
      where: { id: existingMarket.id },
      data: {
        marketId: _marketId,
        startTimestamp: Number(marketData.startTime.toString()),
        endTimestamp: Number(marketData.endTime.toString()),
        settled: marketData.settled,
        settlementPriceD18: toDecimal(marketData.settlementPriceD18.toString()),
        baseAssetMinPriceTick: marketData.baseAssetMinPriceTick,
        baseAssetMaxPriceTick: marketData.baseAssetMaxPriceTick,
        maxPriceD18: toDecimal(marketData.maxPriceD18.toString()),
        minPriceD18: toDecimal(marketData.minPriceD18.toString()),
        poolAddress: marketData.pool,
        claimStatementYesOrNumeric: marketData.claimStatementYesOrNumeric,
        claimStatementNo: marketData.claimStatementNo,
        marketParamsFeerate: marketGroupParams.feeRate,
        marketParamsAssertionliveness: toDecimal(
          marketGroupParams.assertionLiveness.toString()
        ),
        marketParamsBondcurrency: marketGroupParams.bondCurrency,
        marketParamsBondamount: toDecimal(
          marketGroupParams.bondAmount.toString()
        ),
        marketParamsUniswappositionmanager:
          marketGroupParams.uniswapPositionManager,
        marketParamsUniswapswaprouter: marketGroupParams.uniswapSwapRouter,
        marketParamsUniswapquoter: marketGroupParams.uniswapQuoter,
        marketParamsOptimisticoraclev3: marketGroupParams.optimisticOracleV3,
      },
    });
  } else {
    // Create new market
    await prisma.market.create({
      data: {
        marketId: _marketId,
        startTimestamp: Number(marketData.startTime.toString()),
        endTimestamp: Number(marketData.endTime.toString()),
        settled: marketData.settled,
        settlementPriceD18: toDecimal(marketData.settlementPriceD18.toString()),
        baseAssetMinPriceTick: marketData.baseAssetMinPriceTick,
        baseAssetMaxPriceTick: marketData.baseAssetMaxPriceTick,
        maxPriceD18: toDecimal(marketData.maxPriceD18.toString()),
        minPriceD18: toDecimal(marketData.minPriceD18.toString()),
        poolAddress: marketData.pool,
        marketGroupId: marketGroup.id,
        claimStatementYesOrNumeric: marketData.claimStatementYesOrNumeric,
        claimStatementNo: marketData.claimStatementNo,
        marketParamsFeerate: marketGroupParams.feeRate,
        marketParamsAssertionliveness: toDecimal(
          marketGroupParams.assertionLiveness.toString()
        ),
        marketParamsBondcurrency: marketGroupParams.bondCurrency,
        marketParamsBondamount: toDecimal(
          marketGroupParams.bondAmount.toString()
        ),
        marketParamsUniswappositionmanager:
          marketGroupParams.uniswapPositionManager,
        marketParamsUniswapswaprouter: marketGroupParams.uniswapSwapRouter,
        marketParamsUniswapquoter: marketGroupParams.uniswapQuoter,
        marketParamsOptimisticoraclev3: marketGroupParams.optimisticOracleV3,
      },
    });
  }
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
export const createOrUpdateMarketGroupFromEvent = async (
  eventArgs: MarketGroupCreatedUpdatedEventLog,
  chainId: number,
  address: string,
  originalMarket?: MarketGroup | null
) => {
  let marketGroup: MarketGroup;

  if (originalMarket) {
    marketGroup = originalMarket;
  } else {
    // Create new market
    marketGroup = await prisma.marketGroup.create({
      data: {
        chainId,
        address: address.toLowerCase(),
        isBridged: eventArgs?.isBridged || false,
        marketParamsFeerate: Number(eventArgs.marketParams.feeRate) || null,
        marketParamsAssertionliveness:
          eventArgs?.marketParams?.assertionLiveness?.toString() || null,
        marketParamsBondcurrency: eventArgs?.marketParams?.bondCurrency || null,
        marketParamsBondamount:
          eventArgs?.marketParams?.bondAmount?.toString() || null,
        marketParamsUniswappositionmanager:
          eventArgs?.marketParams?.uniswapPositionManager || null,
        marketParamsUniswapswaprouter:
          eventArgs?.marketParams?.uniswapSwapRouter || null,
        marketParamsUniswapquoter:
          eventArgs?.marketParams?.uniswapQuoter || null,
        marketParamsOptimisticoraclev3:
          eventArgs?.marketParams?.optimisticOracleV3 || null,
      },
    });
  }

  // Update market data
  const updateData: Partial<MarketGroup> = {};

  if (eventArgs.collateralAsset) {
    updateData.collateralAsset = eventArgs.collateralAsset;
  }
  if (eventArgs.initialOwner) {
    updateData.owner = (eventArgs.initialOwner as string).toLowerCase();
  }

  if (Object.keys(updateData).length > 0) {
    marketGroup = await prisma.marketGroup.update({
      where: { id: marketGroup.id },
      data: updateData,
    });
  }

  return marketGroup;
};

export const getTradeTypeFromEvent = (eventArgs: TradePositionEventLog) => {
  if (BigInt(eventArgs.finalPrice) > BigInt(eventArgs.initialPrice)) {
    return TransactionType.long;
  }
  return TransactionType.short;
};

/**
 * Updates a Transaction with the relevant information from a LiquidityPositionCreatedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the LiquidityPositionCreatedEventLog args
 */
export const updateTransactionFromAddLiquidityEvent = (
  newTransaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event
) => {
  newTransaction.type = TransactionType.addLiquidity;

  updateTransactionStateFromEvent(newTransaction, event);

  const args = getLogDataArgs(event.logData);
  newTransaction.lpBaseDeltaToken = String(args.addedAmount0 || '0');
  newTransaction.lpQuoteDeltaToken = String(args.addedAmount1 || '0');

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken) {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken) {
    newTransaction.quoteToken = '0';
  }

  if (!newTransaction.borrowedBaseToken) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (!newTransaction.borrowedQuoteToken) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral) {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18) {
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
  newTransaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event
) => {
  newTransaction.type = TransactionType.removeLiquidity;

  updateTransactionStateFromEvent(newTransaction, event);

  const args = getLogDataArgs(event.logData);
  newTransaction.lpBaseDeltaToken = String(args.collectedAmount0 || '0');
  newTransaction.lpQuoteDeltaToken = String(args.collectedAmount1 || '0');

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken) {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken) {
    newTransaction.quoteToken = '0';
  }

  if (!newTransaction.borrowedBaseToken) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (!newTransaction.borrowedQuoteToken) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral) {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18) {
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
  newTransaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event,
  isDecrease?: boolean
) => {
  newTransaction.type = isDecrease
    ? TransactionType.removeLiquidity
    : TransactionType.addLiquidity;

  updateTransactionStateFromEvent(newTransaction, event);

  const args = getLogDataArgs(event.logData);

  newTransaction.lpBaseDeltaToken = isDecrease
    ? (BigInt(String(args.decreasedAmount0 || '0')) * BigInt(-1)).toString()
    : String(args.increasedAmount0 || '0');

  newTransaction.lpQuoteDeltaToken = isDecrease
    ? (BigInt(String(args.decreasedAmount1 || '0')) * BigInt(-1)).toString()
    : String(args.increasedAmount1 || '0');

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken) {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken) {
    newTransaction.quoteToken = '0';
  }

  if (!newTransaction.borrowedBaseToken) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (!newTransaction.borrowedQuoteToken) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral) {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18) {
    newTransaction.tradeRatioD18 = '0';
  }
};

/**
 * Updates a Transaction with the relevant information from a TradePositionModifiedEventLog event.
 * @param newTransaction the Transaction to update
 * @param event the Event containing the TradePositionModifiedEventLog args
 */
export const updateTransactionFromTradeModifiedEvent = async (
  newTransaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event
) => {
  const args = getLogDataArgs(event.logData);
  newTransaction.type = getTradeTypeFromEvent({
    finalPrice: args.finalPrice || '0',
    initialPrice: args.initialPrice || '0',
  } as TradePositionEventLog);

  updateTransactionStateFromEvent(newTransaction, event);

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken) {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken) {
    newTransaction.quoteToken = '0';
  }

  if (!newTransaction.borrowedBaseToken) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (!newTransaction.borrowedQuoteToken) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral) {
    newTransaction.collateral = '0';
  }

  if (!newTransaction.tradeRatioD18 && args.tradeRatio) {
    newTransaction.tradeRatioD18 = String(args.tradeRatio);
  } else if (!newTransaction.tradeRatioD18) {
    newTransaction.tradeRatioD18 = '0';
  }
};

export const updateTransactionFromPositionSettledEvent = async (
  newTransaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  },
  event: Event,
  marketGroupAddress: string,
  marketId: number,
  chainId: number
) => {
  newTransaction.type = TransactionType.settledPosition;

  const args = getLogDataArgs(event.logData);
  const positionId = args.positionId;

  const markets = await prisma.market.findMany({
    where: {
      market_group: {
        address: marketGroupAddress.toLowerCase(),
        chainId: chainId,
      },
    },
    include: {
      position: true,
    },
  });

  let found = false;
  for (const market of markets) {
    const position = market.position.find(
      (p: Position) => p.positionId === Number(positionId)
    );
    if (position) {
      updateTransactionStateFromEvent(newTransaction, event);
      newTransaction.tradeRatioD18 =
        market.settlementPriceD18?.toString() || '0';
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error(`Market not found for position id ${positionId}`);
  }

  // Ensure all required fields have default values if not set
  if (!newTransaction.baseToken) {
    newTransaction.baseToken = '0';
  }

  if (!newTransaction.quoteToken) {
    newTransaction.quoteToken = '0';
  }

  if (!newTransaction.borrowedBaseToken) {
    newTransaction.borrowedBaseToken = '0';
  }

  if (!newTransaction.borrowedQuoteToken) {
    newTransaction.borrowedQuoteToken = '0';
  }

  if (!newTransaction.collateral) {
    newTransaction.collateral = '0';
  }
};

/**
 * Creates a new Market from a given event
 * @param eventArgs The event arguments from the MarketCreated event.
 * @param marketGroup The market group associated with the market.
 * @returns The newly created or updated market.
 */
export const createMarketFromEvent = async (
  eventArgs: MarketCreatedEventLog,
  marketGroup: MarketGroup
) => {
  // first check if there's an existing market in the database before creating a new one
  const existingMarket = await prisma.market.findFirst({
    where: {
      marketId: Number(eventArgs.marketId),
      market_group: {
        address: marketGroup.address?.toLowerCase(),
        chainId: marketGroup.chainId,
      },
    },
  });

  if (existingMarket) {
    // Update existing market
    await prisma.market.update({
      where: { id: existingMarket.id },
      data: {
        marketId: Number(eventArgs.marketId),
        startTimestamp: Number(eventArgs.startTime),
        endTimestamp: Number(eventArgs.endTime),
        startingSqrtPriceX96: eventArgs.startingSqrtPriceX96?.toString(),
        marketParamsFeerate: marketGroup.marketParamsFeerate,
        marketParamsAssertionliveness:
          marketGroup.marketParamsAssertionliveness,
        marketParamsBondcurrency: marketGroup.marketParamsBondcurrency,
        marketParamsBondamount: marketGroup.marketParamsBondamount,
        claimStatementYesOrNumeric: eventArgs.claimStatementYesOrNumeric,
        claimStatementNo: eventArgs.claimStatementNo,
        marketParamsUniswappositionmanager:
          marketGroup.marketParamsUniswappositionmanager,
        marketParamsUniswapswaprouter:
          marketGroup.marketParamsUniswapswaprouter,
        marketParamsUniswapquoter: marketGroup.marketParamsUniswapquoter,
        marketParamsOptimisticoraclev3:
          marketGroup.marketParamsOptimisticoraclev3,
      },
    });
    return existingMarket;
  } else {
    // Create new market
    const newMarket = await prisma.market.create({
      data: {
        marketId: Number(eventArgs.marketId),
        marketGroupId: marketGroup.id,
        startTimestamp: Number(eventArgs.startTime),
        endTimestamp: Number(eventArgs.endTime),
        startingSqrtPriceX96: eventArgs.startingSqrtPriceX96?.toString(),
        marketParamsFeerate: marketGroup.marketParamsFeerate,
        marketParamsAssertionliveness:
          marketGroup.marketParamsAssertionliveness,
        marketParamsBondcurrency: marketGroup.marketParamsBondcurrency,
        marketParamsBondamount: marketGroup.marketParamsBondamount,
        claimStatementYesOrNumeric: eventArgs.claimStatementYesOrNumeric,
        claimStatementNo: eventArgs.claimStatementNo,
        marketParamsUniswappositionmanager:
          marketGroup.marketParamsUniswappositionmanager,
        marketParamsUniswapswaprouter:
          marketGroup.marketParamsUniswapswaprouter,
        marketParamsUniswapquoter: marketGroup.marketParamsUniswapquoter,
        marketParamsOptimisticoraclev3:
          marketGroup.marketParamsOptimisticoraclev3,
      },
    });
    return newMarket;
  }
};

export const getMarketStartEndBlock = async (
  marketGroup: MarketGroup,
  marketId: string,
  overrideClient?: PublicClient
) => {
  const market = await prisma.market.findFirst({
    where: { market_group: { id: marketGroup.id }, marketId: Number(marketId) },
  });

  if (!market) {
    return { error: 'Market not found' };
  }

  const now = Math.floor(Date.now() / 1000);
  const startTimestamp = Number(market.startTimestamp);
  const endTimestamp = Math.min(Number(market.endTimestamp), now);

  // Get the client for the specified chain ID
  const client = overrideClient || getProviderForChain(marketGroup.chainId);

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

const isLpPosition = (
  transaction: Transaction & {
    event: Event & { market_group: MarketGroup };
    position?: Position | null;
  }
) => {
  if (transaction.type === TransactionType.addLiquidity) {
    return true;
  } else if (transaction.type === TransactionType.removeLiquidity) {
    // for remove liquidity, check if the position closed and kind is 2, which means it becomes a trade position
    const logData = transaction.event.logData as Record<string, unknown>;
    const eventName = logData?.eventName;
    const args = logData?.args as Record<string, unknown> | undefined;
    const kind = args?.kind;

    if (eventName === EventType.LiquidityPositionClosed && `${kind}` === '2') {
      return false;
    }
    return true;
  }
  return false;
};

// Helper function to safely convert values to Decimal
const toDecimal = (value: unknown): Decimal => {
  if (value === null || value === undefined) {
    return new Decimal('0');
  }
  return new Decimal(String(value));
};

// Helper function to safely access logData.args
const getLogDataArgs = (logData: unknown): Record<string, unknown> => {
  if (!logData || typeof logData !== 'object') {
    return {};
  }
  const logDataObj = logData as Record<string, unknown>;
  return (logDataObj.args as Record<string, unknown>) || {};
};

type MarketReadResult = readonly [
  marketData: MarketData,
  marketParams: MarketParams,
];
