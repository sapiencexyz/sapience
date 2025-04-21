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
import { useAccount } from 'wagmi';

import NumberDisplay from '~/components/shared/NumberDisplay';
import type { Position } from '~/lib/interfaces/interfaces';
import { calculateEffectiveEntryPrice } from '~/lib/utils/util';

// --- Constants ---
const WEI_PER_ETHER = 1e18;

interface TraderPositionsTableProps {
  positions: Position[];
}

function PositionCell({ position }: { position: Position }) {
  const value =
    (Number(position.baseToken) - Number(position.borrowedBaseToken || 0)) /
    WEI_PER_ETHER;
  const { baseTokenName } = position.market.marketGroup;

  if (baseTokenName === 'Yes') {
    if (value >= 0) {
      return (
        <Badge variant="default">
          <NumberDisplay value={value} /> YES
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <NumberDisplay value={Math.abs(value)} /> NO
      </Badge>
    );
  }
  const displayValue = isNaN(value) ? 0 : value;
  const displayName = baseTokenName || 'Tokens';
  return (
    <span>
      <NumberDisplay value={displayValue} /> {displayName}
    </span>
  );
}

function MaxPayoutCell({ position }: { position: Position }) {
  const { baseTokenName } = position.market.marketGroup;

  if (baseTokenName === 'Yes') {
    const value =
      (Number(position.baseToken) - Number(position.borrowedBaseToken || 0)) /
      WEI_PER_ETHER;

    let maxPayoutAmount;
    if (value >= 0) {
      maxPayoutAmount = Number(position.baseToken) / WEI_PER_ETHER;
    } else {
      maxPayoutAmount = Number(position.borrowedBaseToken || 0) / WEI_PER_ETHER;
    }
    const displayAmount = isNaN(maxPayoutAmount) ? 0 : maxPayoutAmount;

    return (
      <>
        <NumberDisplay value={displayAmount} /> {baseTokenName}
      </>
    );
  }
  return <em className="text-muted-foreground">N/A</em>;
}

function PositionValueCell({ position }: { position: Position }) {
  const { transactions } = position;

  // --- Market & Position Info ---
  // TODO: Fetch and use the *actual* current market price
  const currentMarketPrice = 0.5; // Placeholder

  const baseTokenAmount = Number(position.baseToken) / WEI_PER_ETHER;
  const borrowedBaseTokenAmount =
    Number(position.borrowedBaseToken || 0) / WEI_PER_ETHER;
  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;
  const { baseTokenName, collateralSymbol } = position.market.marketGroup;

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
  // Ensure values are numbers before calculation
  currentPositionValue = isNaN(currentPositionValue) ? 0 : currentPositionValue;
  costBasis = isNaN(costBasis) ? 0 : costBasis;

  const pnl = currentPositionValue - costBasis;
  // Calculate PnL percentage, handle division by zero if costBasis is 0
  const pnlPercentage = costBasis !== 0 ? (pnl / costBasis) * 100 : 0;

  const displayCollateralSymbol = collateralSymbol || 'Units';

  return (
    <>
      <NumberDisplay value={currentPositionValue} /> {displayCollateralSymbol}{' '}
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
              <TableHead>Question</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Wager</TableHead>
              <TableHead>Position Value</TableHead>
              <TableHead>Max Payout</TableHead>
              <TableHead />
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

              return (
                <TableRow key={position.id}>
                  <TableCell>{position.market.question || 'N/A'}</TableCell>
                  <TableCell>
                    <PositionCell position={position} />
                  </TableCell>
                  <TableCell>
                    <NumberDisplay
                      value={Number(position.collateral) / WEI_PER_ETHER}
                    />{' '}
                    {position.market.marketGroup.collateralSymbol || 'Units'}
                  </TableCell>
                  <TableCell>
                    <PositionValueCell position={position} />
                  </TableCell>
                  <TableCell>
                    <MaxPayoutCell position={position} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={position.isSettled ? 'default' : 'secondary'}
                      disabled={!isOwner} // Keep disabled logic based on ownership
                    >
                      {position.isSettled ? 'Claim' : 'Sell'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
