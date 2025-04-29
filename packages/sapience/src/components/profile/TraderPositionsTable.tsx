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
import Link from 'next/link';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import type { Position } from '~/lib/interfaces/interfaces';
import {
  calculateEffectiveEntryPrice,
  getChainShortName,
} from '~/lib/utils/util';

interface TraderPositionsTableProps {
  positions: Position[];
}

function PositionCell({ position }: { position: Position }) {
  const baseTokenBI = BigInt(position.baseToken || '0');
  const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
  const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
  const value = Number(formatEther(netPositionBI));
  const absValue = Math.abs(value);
  const { baseTokenName } = position.market.marketGroup;

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

function MaxPayoutCell({ position }: { position: Position }) {
  const { baseTokenName, collateralSymbol } = position.market.marketGroup;

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

function PositionValueCell({ position }: { position: Position }) {
  const { transactions } = position;
  const { marketGroup, marketId } = position.market;
  const { address, chainId, baseTokenName, collateralSymbol } = marketGroup;

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
  // const { baseTokenName, collateralSymbol } = position.market.marketGroup; // Moved up

  // --- Calculate Effective Entry Price ---
  const entryPrice = calculateEffectiveEntryPrice(transactions, isLong);

  // --- Calculate Position Size, Value, PnL ---
  let positionSize = 0;
  let currentPositionValue = 0;
  let costBasis = 0; // The value at entry

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
      // Current value of a short YES position = Size * (1 - CurrentPrice)
      currentPositionValue = positionSize * (1 - currentMarketPrice);
      // Cost basis of a short YES position = Size * (1 - EntryPrice)
      // This represents the collateral 'locked' or the value obtained at entry
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
    // Current value of a short position = Size * (EntryPrice - CurrentPrice) + CostBasis ? Needs verification.
    // Let's try: Value = Initial Collateral + PnL = CostBasis + PnL
    // PnL = Size * (EntryPrice - CurrentPrice)
    // simpler: represent value based on closing the position
    const pnlPerUnit = entryPrice - currentMarketPrice;
    const totalPnl = positionSize * pnlPerUnit;
    // Assuming cost basis represents initial collateral required or value at entry
    // For a simple short, cost basis might be complex. Let's use entryPrice * size for now,
    // but this needs validation based on the specific market mechanics.
    costBasis = positionSize * entryPrice; // This might not be the intuitive 'cost'
    // Current Value = Cost Basis + PnL
    // OR Current Value could be seen as liability: -(PositionSize * CurrentMarketPrice) ?
    // Let's stick to PnL calculation for display consistency.
    currentPositionValue = costBasis + totalPnl; // Value = What you started with + Profit/Loss
  }

  // --- PnL Calculation ---
  // Ensure values are numbers before calculation (redundant as Number() already used)
  // currentPositionValue = isNaN(currentPositionValue) ? 0 : currentPositionValue;
  // costBasis = isNaN(costBasis) ? 0 : costBasis;

  const pnl = currentPositionValue - costBasis;
  // Calculate PnL percentage, handle division by zero if costBasis is 0
  const pnlPercentage = costBasis !== 0 ? (pnl / costBasis) * 100 : 0;

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
      <small className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
        ({pnlPercentage.toFixed(2)}%)
      </small>
    </>
  );
}

export default function TraderPositionsTable({
  positions,
}: TraderPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

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

  return (
    <div>
      <h3 className="font-medium mb-4">Positions</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Question</TableHead>
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
            {validPositions.map((position: Position) => {
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
                position.market.marketGroup.chainId
              );
              const marketAddress = position.market.marketGroup.address;

              return (
                <TableRow key={position.id}>
                  <TableCell>{position.market.question || 'N/A'}</TableCell>
                  {isClosed ? (
                    <TableCell
                      colSpan={5}
                      className="text-center font-medium text-muted-foreground"
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
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={
                              position.isSettled ? 'default' : 'secondary'
                            }
                            disabled={!isOwner} // Keep disabled logic based on ownership
                          >
                            {position.isSettled ? 'Claim' : 'Sell'}
                          </Button>
                          <Link
                            href={`/forecasting/${chainShortName}:${marketAddress}/${position.market.marketId}?positionId=${position.positionId}`}
                            passHref
                          >
                            <Button size="sm" variant="outline">
                              View
                            </Button>
                          </Link>
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
