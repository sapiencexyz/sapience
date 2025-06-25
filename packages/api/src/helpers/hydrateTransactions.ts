import { formatDbBigInt } from '../utils/utils';
import { Prisma } from '../../generated/prisma';

// Prisma transaction type with all necessary includes
export type PrismaTransactionWithIncludes = Prisma.transactionGetPayload<{
  include: {
    position: {
      include: {
        market: {
          include: {
            market_group: {
              include: {
                resource: true;
              };
            };
          };
        };
      };
    };
    event: true;
  };
}>;

export type HydratedTransaction = Omit<
  PrismaTransactionWithIncludes,
  'tradeRatioD18'
> & {
  tradeRatioD18: string | null;
  collateralDelta: string;
  baseTokenDelta: string;
  quoteTokenDelta: string;
};

export const hydrateTransactions = (
  transactions: PrismaTransactionWithIncludes[],
  shouldFormatUnits: boolean = true
): HydratedTransaction[] => {
  const hydratedTrasactions: HydratedTransaction[] = [];

  // Format data
  let lastPositionId = 0;
  let lastBaseToken = BigInt(0);
  let lastQuoteToken = BigInt(0);
  let lastCollateral = BigInt(0);
  for (const transaction of transactions) {
    // Convert Prisma Decimal to string for formatDbBigInt
    const tradeRatioD18Str = transaction.tradeRatioD18?.toString() || null;
    const formattedTradeRatio = tradeRatioD18Str
      ? formatDbBigInt(tradeRatioD18Str)
      : null;

    const hydratedTransaction: HydratedTransaction = {
      ...transaction,
      tradeRatioD18: formattedTradeRatio,
      collateralDelta: '0',
      baseTokenDelta: '0',
      quoteTokenDelta: '0',
    };

    // if transactions come from the position.transactions it doesn't have a .position, but all the transactions correspond to the same position
    if (
      transaction.position &&
      transaction.position.positionId !== lastPositionId
    ) {
      lastBaseToken = BigInt(0);
      lastQuoteToken = BigInt(0);
      lastCollateral = BigInt(0);
      lastPositionId = transaction.position.positionId;
    }

    // Convert Prisma Decimal values to BigInt for calculations
    const baseTokenBigInt = transaction.baseToken
      ? BigInt(transaction.baseToken.toString())
      : BigInt(0);
    const quoteTokenBigInt = transaction.quoteToken
      ? BigInt(transaction.quoteToken.toString())
      : BigInt(0);
    const collateralBigInt = BigInt(transaction.collateral.toString());
    const lpBaseDeltaBigInt = transaction.lpBaseDeltaToken
      ? BigInt(transaction.lpBaseDeltaToken.toString())
      : null;
    const lpQuoteDeltaBigInt = transaction.lpQuoteDeltaToken
      ? BigInt(transaction.lpQuoteDeltaToken.toString())
      : null;

    // If the transaction is from a liquidity position, use the lpDeltaToken values
    // Otherwise, use the baseToken and quoteToken values from the previous transaction (trade with history)
    const currentBaseTokenBalance =
      lpBaseDeltaBigInt || baseTokenBigInt - lastBaseToken;
    const currentQuoteTokenBalance =
      lpQuoteDeltaBigInt || quoteTokenBigInt - lastQuoteToken;
    const currentCollateralBalance = collateralBigInt - lastCollateral;

    hydratedTransaction.baseTokenDelta = shouldFormatUnits
      ? formatDbBigInt(currentBaseTokenBalance.toString())
      : currentBaseTokenBalance.toString();
    hydratedTransaction.quoteTokenDelta = shouldFormatUnits
      ? formatDbBigInt(currentQuoteTokenBalance.toString())
      : currentQuoteTokenBalance.toString();
    hydratedTransaction.collateralDelta = shouldFormatUnits
      ? formatDbBigInt(currentCollateralBalance.toString())
      : currentCollateralBalance.toString();

    hydratedTrasactions.push(hydratedTransaction);

    // set up for next transaction
    lastBaseToken = baseTokenBigInt;
    lastQuoteToken = quoteTokenBigInt;
    lastCollateral = collateralBigInt;
  }
  return hydratedTrasactions;
};
