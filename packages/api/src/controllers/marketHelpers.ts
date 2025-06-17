import 'tsconfig-paths/register';
import prisma from '../db';
import { PublicClient, erc20Abi } from 'viem';
import {
  Deployment,
  EpochCreatedEventLog,
  MarketCreatedUpdatedEventLog,
  TradePositionEventLog,
  EpochData,
  EventType,
} from '../interfaces';
import { getBlockByTimestamp, getProviderForChain } from '../utils/utils';
import Foil from '@foil/protocol/deployments/Foil.json';
import type { 
  event, 
  market_group, 
  market, 
  position, 
  transaction, 
  collateral_transfer, 
  market_price,
  transaction_type_enum 
} from '../generated/prisma';

// Define transaction types
const TransactionType = {
  ADD_LIQUIDITY: 'addLiquidity' as const,
  REMOVE_LIQUIDITY: 'removeLiquidity' as const,
  LONG: 'long' as const,
  SHORT: 'short' as const,
  SETTLE_POSITION: 'settledPosition' as const,
};

// Define market params interface to match the embedded type in Prisma schema
interface MarketParams {
  feeRate?: number;
  assertionLiveness?: string;
  bondCurrency?: string;
  bondAmount?: string;
  claimStatement?: string;
  uniswapPositionManager?: string;
  uniswapSwapRouter?: string;
  uniswapQuoter?: string;
  optimisticOracleV3?: string;
}

/**
 * Handles a Transfer event by updating the owner of the corresponding Position.
 * @param event The Transfer event
 */
export const handleTransferEvent = async (event: event & { marketGroup: market_group }) => {
  const { to, tokenId } = event.logData as any;

  const existingPosition = await prisma.position.findFirst({
    where: {
      positionId: Number(tokenId),
      market: {
        market_group: {
          address: event.marketGroup.address?.toLowerCase(),
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
export const handlePositionSettledEvent = async (event: event) => {
  const { positionId } = event.logData as any;

  const existingPosition = await prisma.position.findFirst({
    where: {
      positionId: Number(positionId),
    },
  });

  if (!existingPosition) {
    // Ignore the settled event until the position is created from another event
    console.log('Position not found for settled event: ', event);
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
  transaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  }
) => {
  try {
    const eventArgs = transaction.event.logData as any;
    let epochId = eventArgs.epochId;
    let epoch;

    if (!epochId) {
      const positionId = transaction.event.logData.args?.positionId;

      const markets = await prisma.market.findMany({
        where: {
          market_group: {
            address: transaction.event.marketGroup.address?.toLowerCase(),
            chainId: transaction.event.marketGroup.chainId,
          },
        },
        include: {
          position: true,
        },
      });

      let found = false;
      for (const market of markets) {
        const position = market.position.find(
          (p: position) => p.positionId === Number(positionId)
        );
        if (position) {
          epoch = market;
          epochId = market.marketId;
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error(`Market not found for position id ${positionId}`);
      }
    } else {
      epoch = await prisma.market.findFirst({
        where: {
          marketId: Number(epochId),
          market_group: {
            address: transaction.event.marketGroup.address?.toLowerCase(),
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
        throw new Error(`Epoch not found: ${epochId}`);
      }
    }
    
    const positionId = Number(transaction.event.logData.args?.positionId);
    if (isNaN(positionId)) {
      console.error(
        'Invalid positionId:',
        transaction.event.logData.args?.positionId
      );
      return;
    }

    const existingPosition = await prisma.position.findFirst({
      where: {
        market: {
          marketId: Number(epochId),
          market_group: {
            address: transaction.event.marketGroup.address?.toLowerCase(),
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
          }
        },
        market: {
          include: {
            market_group: true,
          }
        },
      }
    });

    let savedPosition: position;

    if (existingPosition) {
      console.log('Found existing position:', existingPosition.id);
      
      // Update existing position
      savedPosition = await prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          positionId: positionId,
          marketId: epoch.id,
          owner: ((eventArgs.sender as string) || existingPosition.owner || '').toLowerCase(),
          isLP: isLpPosition(transaction),
          baseToken: (eventArgs.positionVgasAmount as string) || '0',
          quoteToken: (eventArgs.positionVethAmount as string) || '0',
          borrowedBaseToken: (eventArgs.positionBorrowedVgas as string) || '0',
          borrowedQuoteToken: (eventArgs.positionBorrowedVeth as string) || '0',
          collateral: (eventArgs.positionCollateralAmount as string) || '0',
          lpBaseToken: (eventArgs.loanAmount0 as string) || (eventArgs.addedAmount0 as string) || '0',
          lpQuoteToken: (eventArgs.loanAmount1 as string) || (eventArgs.addedAmount1 as string) || '0',
          highPriceTick: eventArgs.upperTick?.toString() || existingPosition.highPriceTick || '0',
          lowPriceTick: eventArgs.lowerTick?.toString() || existingPosition.lowPriceTick || '0',
          isSettled: existingPosition.isSettled ?? false,
        },
      });
    } else {
      console.log('Creating new position for positionId:', positionId);
      
      // Create new position
      savedPosition = await prisma.position.create({
        data: {
          positionId: positionId,
          marketId: epoch.id,
          owner: ((eventArgs.sender as string) || '').toLowerCase(),
          isLP: isLpPosition(transaction),
          baseToken: (eventArgs.positionVgasAmount as string) || '0',
          quoteToken: (eventArgs.positionVethAmount as string) || '0',
          borrowedBaseToken: (eventArgs.positionBorrowedVgas as string) || '0',
          borrowedQuoteToken: (eventArgs.positionBorrowedVeth as string) || '0',
          collateral: (eventArgs.positionCollateralAmount as string) || '0',
          lpBaseToken: (eventArgs.loanAmount0 as string) || (eventArgs.addedAmount0 as string) || '0',
          lpQuoteToken: (eventArgs.loanAmount1 as string) || (eventArgs.addedAmount1 as string) || '0',
          highPriceTick: eventArgs.upperTick?.toString() || '0',
          lowPriceTick: eventArgs.lowerTick?.toString() || '0',
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
  transaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event
) => {
  const eventArgs = event.logData as any;
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
export const insertCollateralTransfer = async (transaction: transaction & { 
  event: event & { marketGroup: market_group },
  position?: position | null
}) => {
  const eventArgs = transaction.event.logData as any;

  if (!eventArgs.deltaCollateral || eventArgs.deltaCollateral == '0') {
    console.log('Delta collateral not found in eventArgs');
    return;
  }

  // Check if a collateral transfer already exists for this transaction hash
  const existingTransfer = await prisma.collateral_transfer.findFirst({
    where: { transactionHash: transaction.event.transactionHash },
  });

  if (existingTransfer) {
    // If it exists, just use it
    transaction.collateralTransfer = existingTransfer;
    return;
  }

  // Create a new one if it doesn't exist
  const transfer = await prisma.collateral_transfer.create({
    data: {
      transactionHash: transaction.event.transactionHash,
      timestamp: Number(transaction.event.timestamp),
      owner: ((eventArgs.sender as string) || '').toLowerCase(),
      collateral: eventArgs.deltaCollateral as string,
    },
  });

  // Save and assign to transaction
  transaction.collateralTransfer = transfer;
};

/**
 * Create a MarketPrice for a Transaction.
 * @param transaction the Transaction to create a MarketPrice for
 */
export const insertMarketPrice = async (transaction: transaction & { 
  event: event & { marketGroup: market_group },
  position?: position | null
}) => {
  if (
    transaction.type === TransactionType.LONG ||
    transaction.type === TransactionType.SHORT
  ) {
    // Create a new market price
    const newMp = await prisma.market_price.create({
      data: {
        value: transaction.event.logData.args.finalPrice as string,
        timestamp: transaction.event.timestamp,
      },
    });

    // Save and assign to transaction
    transaction.marketPrice = newMp;
  }
};

/**
 * Updates the collateral decimals and symbol for a market.
 * @param client The provider client for the chain
 * @param market The market to update
 */
export const updateCollateralData = async (
  client: PublicClient,
  market: market_group
) => {
  if (market.collateralAsset) {
    try {
      const decimals = await client.readContract({
        address: market.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      market.collateralDecimals = Number(decimals);
      const symbol = await client.readContract({
        address: market.collateralAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      market.collateralSymbol = symbol as string;
    } catch (error) {
      console.error(
        `Failed to fetch decimals or symbol for token ${market.collateralAsset}:`,
        error
      );
    }
  }
};

export const createOrUpdateMarketFromContract = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  initialMarket?: market_group
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
    const existingMarket = await prisma.market_group.findFirst({
      where: { address: address.toLowerCase(), chainId },
      include: {
        markets: true,
      },
    });
    updatedMarket = existingMarket || prisma.market_group.create({
      data: {
        address: address.toLowerCase(),
        deployTxnBlockNumber: Number(contractDeployment.deployTxnBlockNumber),
        deployTimestamp: Number(contractDeployment.deployTimestamp),
        chainId,
        owner: ((marketReadResult as MarketReadResult)[0] as string).toLowerCase(),
        collateralAsset: (marketReadResult as MarketReadResult)[1],
      },
    });
  }

  // update market params appropriately
  updatedMarket.address = address.toLowerCase();
  updatedMarket.deployTxnBlockNumber = Number(contractDeployment.deployTxnBlockNumber);
  updatedMarket.deployTimestamp = Number(contractDeployment.deployTimestamp);
  updatedMarket.chainId = chainId;
  updatedMarket.owner = ((marketReadResult as MarketReadResult)[0] as string).toLowerCase();
  updatedMarket.collateralAsset = (marketReadResult as MarketReadResult)[1];

  // Update collateral data
  await updateCollateralData(client, updatedMarket);

  const marketParamsRaw = (marketReadResult as MarketReadResult)[4];
  const marketParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw.bondAmount?.toString() ?? '0',
  };
  updatedMarket.marketParams = marketParams;
  await prisma.market_group.update({
    where: { id: updatedMarket.id },
    data: updatedMarket,
  });
  return updatedMarket;
};

export const createOrUpdateEpochFromContract = async (
  market: market_group,
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
  const existingEpoch = await prisma.market.findFirst({
    where: {
      marketGroup: { address: market.address.toLowerCase() },
      marketId: _epochId,
    },
  });
  const updatedEpoch = existingEpoch || prisma.market.create({
    data: {
      marketId: _epochId,
      startTimestamp: Number(epochData.startTime.toString()),
      endTimestamp: Number(epochData.endTime.toString()),
      settled: epochData.settled,
      settlementPriceD18: epochData.settlementPriceD18.toString(),
      baseAssetMinPriceTick: epochData.baseAssetMinPriceTick,
      baseAssetMaxPriceTick: epochData.baseAssetMaxPriceTick,
      maxPriceD18: epochData.maxPriceD18.toString(),
      minPriceD18: epochData.minPriceD18.toString(),
      poolAddress: epochData.pool,
      marketGroup: market,
      marketParams: {
        ...market.marketParams,
        assertionLiveness: market.marketParams?.assertionLiveness?.toString() ?? '0',
        bondAmount: market.marketParams?.bondAmount?.toString() ?? '0',
      },
    },
  });

  await prisma.market.update({
    where: { id: updatedEpoch.id },
    data: updatedEpoch,
  });
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
  originalMarket?: market_group | null
) => {
  const market = originalMarket || prisma.market_group.create({
    data: {
      chainId,
      address: address.toLowerCase(),
      marketParams: {
        ...eventArgs.marketParams,
        feeRate: Number(eventArgs.marketParams.feeRate),
        assertionLiveness: eventArgs?.marketParams?.assertionLiveness.toString(),
        bondAmount: eventArgs?.marketParams?.bondAmount.toString(),
      },
    },
  });

  if (eventArgs.collateralAsset) {
    market.collateralAsset = eventArgs.collateralAsset;
  }
  if (eventArgs.initialOwner) {
    market.owner = (eventArgs.initialOwner as string).toLowerCase();
  }

  const newMarket = await prisma.market_group.update({
    where: { id: market.id },
    data: market,
  });
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
  newTransaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event
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
  newTransaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event
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
  newTransaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event,
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
  newTransaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event
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
  newTransaction: transaction & { 
    event: event & { marketGroup: market_group },
    position?: position | null
  },
  event: event,
  marketGroupAddress: string,
  marketId: number,
  chainId: number
) => {
  newTransaction.type = TransactionType.SETTLE_POSITION;

  const positionId = event.logData.args.positionId;

  const markets = await prisma.market.findMany({
    where: {
      marketGroup: {
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
      (p: position) => p.positionId === Number(positionId)
    );
    if (position) {
      updateTransactionStateFromEvent(newTransaction, event);
      newTransaction.tradeRatioD18 = market.settlementPriceD18 || '0';
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error(`Market not found for position id ${positionId}`);
  }

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
};

/**
 * Creates a new Epoch from a given event
 * @param eventArgs The event arguments from the EpochCreated event.
 * @param market The market associated with the epoch.
 * @returns The newly created or updated epoch.
 */
export const createEpochFromEvent = async (
  eventArgs: EpochCreatedEventLog,
  market: market_group
) => {
  // first check if there's an existing epoch in the database before creating a new one
  const existingEpoch = await prisma.market.findFirst({
    where: {
      marketId: Number(eventArgs.epochId),
      market_group: {
        address: market.address.toLowerCase(),
        chainId: market.chainId,
      },
    },
  });

  const newEpoch = existingEpoch || prisma.market.create({
    data: {
      marketId: Number(eventArgs.epochId),
      market_group: market,
      startTimestamp: Number(eventArgs.startTime),
      endTimestamp: Number(eventArgs.endTime),
      startingSqrtPriceX96: eventArgs.startingSqrtPriceX96,
      marketParams: market.marketParams,
    },
  });

  await prisma.market.update({
    where: { id: newEpoch.id },
    data: newEpoch,
  });

  return newEpoch;
};

export const getMarketStartEndBlock = async (
  market: market_group,
  epochId: string,
  overrideClient?: PublicClient
) => {
  const epoch = await prisma.market.findFirst({
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

const isLpPosition = (transaction: transaction & { 
  event: event & { marketGroup: market_group },
  position?: position | null
}) => {
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
