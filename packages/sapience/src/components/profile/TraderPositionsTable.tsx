import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import type { PositionType } from '@foil/ui/types';
import Link from 'next/link';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

import SettlePositionButton from '../forecasting/SettlePositionButton';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import {
  calculateEffectiveEntryPrice,
  getChainShortName,
} from '~/lib/utils/util';

interface TraderPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
}

function PositionCell({ position }: { position: PositionType }) {
  const baseTokenBI = BigInt(position.baseToken || '0');
  const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
  const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
  const value = Number(formatEther(netPositionBI));
  const absValue = Math.abs(value);
  const baseTokenName = position.market.marketGroup?.baseTokenName;

  // Determine direction and styling based on net position value
  if (value >= 0) {
    // Long Position
    return (
      <span className="flex items-center space-x-1.5">
        <Badge
          variant="outline"
          className="px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0"
        >
          Long
        </Badge>
        <NumberDisplay value={absValue} />
        <span>{baseTokenName || 'Tokens'}</span>
      </span>
    );
  }
  // Short Position
  return (
    <span className="flex items-center space-x-1.5">
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0"
      >
        Short
      </Badge>
      <NumberDisplay value={absValue} />
      <span>{baseTokenName || 'Tokens'}</span>
    </span>
  );
}

function MaxPayoutCell({ position }: { position: PositionType }) {
  const baseTokenName = position.market.marketGroup?.baseTokenName;
  const collateralSymbol = position.market.marketGroup?.collateralSymbol;

  if (baseTokenName === 'Yes') {
    const baseTokenBI = BigInt(position.baseToken || '0');
    const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
    const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
    const value = Number(formatEther(netPositionBI)); // Used for determining sign

    let maxPayoutAmountBI: bigint;
    if (value >= 0) {
      maxPayoutAmountBI = baseTokenBI;
    } else {
      maxPayoutAmountBI = borrowedBaseTokenBI;
    }
    const displayAmount = Number(formatEther(maxPayoutAmountBI));
    // Removed redundant isNaN check

    return (
      <>
        <NumberDisplay value={displayAmount} /> {collateralSymbol}
      </>
    );
  }
  return <span className="text-muted-foreground">N/A</span>;
}

function PositionValueCell({ position }: { position: PositionType }) {
  const { transactions } = position;
  const { marketId } = position.market;
  const { marketGroup } = position.market;
  const address = marketGroup?.address || '';
  const chainId = marketGroup?.chainId || 0;
  const baseTokenName = marketGroup?.baseTokenName;
  const collateralSymbol = marketGroup?.collateralSymbol;

  // --- Fetch Current Market Price ---
  const { data: currentMarketPriceRaw, isLoading: priceLoading } =
    useMarketPrice(address, chainId, marketId);

  // Default to 0 if undefined after loading, handling the linter error
  const currentMarketPrice = currentMarketPriceRaw ?? 0;

  const baseTokenAmount = Number(
    formatEther(BigInt(position.baseToken || '0'))
  );
  const borrowedBaseTokenAmount = Number(
    formatEther(BigInt(position.borrowedBaseToken || '0'))
  );

  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;

  // --- Calculate Effective Entry Price ---
  const entryPrice = calculateEffectiveEntryPrice(transactions, isLong);

  // --- Calculate Position Size, Value, PnL ---
  let positionSize = 0;
  let currentPositionValue = 0;
  let costBasis = 0; // The value at entry (note: this is different from wager for PnL%)

  if (baseTokenName === 'Yes') {
    // Yes/No Market
    if (isLong) {
      // Long YES
      positionSize = baseTokenAmount;
      currentPositionValue = positionSize * currentMarketPrice;
      costBasis = positionSize * entryPrice;
    } else {
      // Short YES (Long NO)
      positionSize = borrowedBaseTokenAmount;
      currentPositionValue = positionSize * (1 - currentMarketPrice);
      costBasis = positionSize * (1 - entryPrice);
    }
  } else if (isLong) {
    // Linear or other Market Types - Long Position
    positionSize = baseTokenAmount;
    currentPositionValue = positionSize * currentMarketPrice;
    costBasis = positionSize * entryPrice;
  } else {
    // Linear or other Market Types - Short Position
    positionSize = borrowedBaseTokenAmount;
    const pnlPerUnit = entryPrice - currentMarketPrice;
    const totalPnl = positionSize * pnlPerUnit;
    costBasis = positionSize * entryPrice;
    currentPositionValue = costBasis + totalPnl;
  }

  // --- PnL Calculation based on Wager (position.collateral) ---
  const wagerAmount = Number(formatEther(BigInt(position.collateral || '0')));

  // 'pnl' is the profit or loss amount relative to the initial wager
  const pnl = currentPositionValue - wagerAmount;
  // Calculate PnL percentage relative to the wagerAmount
  const pnlPercentage = wagerAmount !== 0 ? (pnl / wagerAmount) * 100 : 0;

  // Display loading state or handle potential errors
  if (priceLoading) {
    return (
      <span className="text-muted-foreground text-xs">Loading price...</span>
    );
    // Or return a spinner, skeleton loader, etc.
  }

  // TODO: Add more robust error handling from useMarketPrice if needed

  return (
    <>
      <NumberDisplay value={currentPositionValue} /> {collateralSymbol}{' '}
      {/* A positive pnl means a gain (value > wager), so green. A negative pnl means a loss. */}
      <small className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
        ({pnlPercentage.toFixed(2)}%)
      </small>
    </>
  );
}

export default function TraderPositionsTable({
  positions,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
}: TraderPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId; // True for a specific market page (with marketId)
  const isProfilePageContext = !parentMarketAddress && !parentChainId; // True if on profile page context

  if (!positions || positions.length === 0) {
    return null;
  }

  const validPositions = positions.filter(
    (p) => p && p.market && p.market.marketGroup && p.id && !p.isLP // Added !isLP check
  );

  if (validPositions.length === 0) {
    // Optionally return null or a message if only LP positions were passed
    // return <p className="text-muted-foreground text-sm">No non-LP positions found.</p>;
    return null;
  }

  let displayQuestionColumn;
  if (isProfilePageContext) {
    displayQuestionColumn = true; // Always show on profile page
  } else if (isMarketPage) {
    // Specific market page
    displayQuestionColumn = false; // Never show on specific market page
  } else {
    // Market group page (parentMarketAddress & parentChainId are present, but parentMarketId is not)
    displayQuestionColumn = validPositions.some(
      (p) =>
        p.market.marketGroup &&
        p.market.marketGroup.markets &&
        p.market.marketGroup.markets.length > 1
    );
  }

  return (
    <div>
      <h3 className="font-medium mb-4">Trader Positions</h3>
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead /> {/* Header for Position ID */}
              {displayQuestionColumn && (
                <TableHead className="whitespace-nowrap">Question</TableHead>
              )}
              <TableHead className="whitespace-nowrap">Position</TableHead>
              <TableHead className="whitespace-nowrap">Wager</TableHead>
              <TableHead className="whitespace-nowrap">
                Position Value
              </TableHead>
              <TableHead className="whitespace-nowrap">Max Payout</TableHead>
              <TableHead className="whitespace-nowrap" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {validPositions.map((position: PositionType) => {
              const isOwner =
                connectedAddress &&
                position.owner &&
                connectedAddress.toLowerCase() === position.owner.toLowerCase();

              if (!position.market?.marketGroup) {
                console.warn(
                  'Skipping position render due to missing market data:',
                  position.id
                );
                return null;
              }

              const isClosed = Number(position.collateral) === 0;
              const chainShortName = getChainShortName(
                position.market.marketGroup.chainId || 0
              );
              const marketAddress = position.market.marketGroup.address || '';

              // Determine if the position is expired and settled
              const endTimestamp = position.market?.endTimestamp;
              // Ensure PositionType includes isSettled. Assuming it does based on UserPositionsTable.
              const isPositionSettled = position.isSettled || false;
              const now = Date.now();
              const isExpired = endTimestamp
                ? Number(endTimestamp) * 1000 < now
                : false;

              return (
                <TableRow key={position.id}>
                  <TableCell className="text-muted-foreground">
                    #{position.id}
                  </TableCell>
                  {displayQuestionColumn && (
                    <TableCell>{position.market.question || 'N/A'}</TableCell>
                  )}
                  {isClosed ? (
                    <TableCell
                      colSpan={displayQuestionColumn ? 7 : 6}
                      className="text-center font-medium text-muted-foreground tracking-wider"
                    >
                      CLOSED
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <PositionCell position={position} />
                      </TableCell>
                      <TableCell>
                        <NumberDisplay
                          value={Number(
                            formatEther(BigInt(position.collateral || '0'))
                          )}
                        />{' '}
                        {position.market.marketGroup.collateralSymbol}
                      </TableCell>
                      <TableCell>
                        <PositionValueCell position={position} />
                      </TableCell>
                      <TableCell>
                        <MaxPayoutCell position={position} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {isOwner &&
                            (isExpired && !isPositionSettled ? (
                              <SettlePositionButton
                                positionId={position.positionId.toString()}
                                marketAddress={marketAddress}
                                chainId={
                                  position.market.marketGroup.chainId || 0
                                }
                                onSuccess={() => {
                                  console.log(
                                    `Settle action for position ${position.positionId} initiated. Consider implementing a data refetch mechanism.`
                                  );
                                }}
                              />
                            ) : (
                              // Render Sell button only if not on Market Page
                              !isMarketPage && (
                                <Link
                                  href={`/forecasting/${chainShortName}:${marketAddress}/${position.market.marketId}?positionId=${position.positionId}`}
                                  passHref
                                >
                                  <Button size="xs" variant="outline">
                                    Sell
                                  </Button>
                                </Link>
                              )
                            ))}
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
