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

interface TraderPositionsTableProps {
  positions: Position[];
}

function PositionCell({ position }: { position: Position }) {
  const value =
    (Number(position.baseToken) - Number(position.borrowedBaseToken || 0)) /
    10 ** 18;
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
  return (
    <span>
      <NumberDisplay value={value} /> {baseTokenName}
    </span>
  );
}

function MaxPayoutCell({ position }: { position: Position }) {
  const { baseTokenName } = position.market.marketGroup;

  if (baseTokenName === 'Yes') {
    const value =
      (Number(position.baseToken) - Number(position.borrowedBaseToken || 0)) /
      10 ** 18;

    let maxPayoutAmount;
    if (value >= 0) {
      // Long position: Max payout is the number of base tokens held
      maxPayoutAmount = Number(position.baseToken) / 10 ** 18;
    } else {
      // Short position: Max payout is the number of base tokens borrowed
      maxPayoutAmount = Number(position.borrowedBaseToken || 0) / 10 ** 18;
    }

    return (
      <>
        <NumberDisplay value={maxPayoutAmount} /> {baseTokenName}
      </>
    );
  }

  return <em className="text-muted-foreground">N/A</em>;
}

function PositionValueCell({ position }: { position: Position }) {
  // --- Placeholders - Requires actual data fetching ---
  // TODO: Fetch and pass the actual market price for this position's market
  const marketPrice = 0.5; // Placeholder for the actual current market price
  // TODO: Calculate actual entry price. Requires transaction data with tradeRatioD18.
  const entryPrice = 0.4; // Placeholder for the actual entry price
  // --- End Placeholders ---

  const baseTokenAmount = Number(position.baseToken) / 10 ** 18;
  const borrowedBaseTokenAmount =
    Number(position.borrowedBaseToken || 0) / 10 ** 18;
  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;

  let positionSize = 0;
  let positionValue = 0;
  let entryValue = 0;
  const { baseTokenName } = position.market.marketGroup;

  if (baseTokenName === 'Yes') {
    // Yes/No Market
    if (isLong) {
      // Long YES
      positionSize = baseTokenAmount;
      positionValue = positionSize * marketPrice;
      entryValue = positionSize * entryPrice;
    } else {
      // Short YES (equivalent to Long NO)
      positionSize = borrowedBaseTokenAmount;
      positionValue = positionSize * marketPrice;
      // Entry value for shorts in Yes/No is based on collateral locked for the borrow at entry
      // which corresponds to (1 - entryPrice) * size
      entryValue = positionSize * (1 - entryPrice);
    }
  } else if (isLong) {
    // Linear or other market type
    positionSize = baseTokenAmount;
    positionValue = positionSize * marketPrice;
    entryValue = positionSize * entryPrice;
  } else {
    // Short position
    positionSize = borrowedBaseTokenAmount;
    positionValue = positionSize * marketPrice;
    entryValue = positionSize * entryPrice;
  }

  const pnl = positionValue - entryValue;
  // Calculate PnL percentage, handle division by zero if entryValue is 0
  const pnlPercentage = entryValue !== 0 ? (pnl / entryValue) * 100 : 0;

  return (
    <>
      <NumberDisplay value={positionValue} />{' '}
      {position.market.marketGroup.collateralSymbol}{' '}
      {/* Display PnL Percentage - based on placeholder values */}
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

  // Return null if there are no positions to display
  if (!positions || positions.length === 0) {
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
            {positions.map((position: Position) => {
              const isOwner =
                connectedAddress &&
                position.owner &&
                connectedAddress.toLowerCase() === position.owner.toLowerCase();

              return (
                <TableRow key={position.id}>
                  <TableCell>{position.market.question}</TableCell>
                  <TableCell>
                    <PositionCell position={position} />
                  </TableCell>
                  <TableCell>
                    <NumberDisplay
                      value={Number(position.collateral) / 10 ** 18}
                    />{' '}
                    {position.market.marketGroup.collateralSymbol}
                  </TableCell>
                  <TableCell>
                    {/* Actual or realized profit/loss */}
                    <PositionValueCell position={position} />
                  </TableCell>
                  <TableCell>
                    {/* Potential profit calculation */}
                    <MaxPayoutCell position={position} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={position.isSettled ? 'default' : 'secondary'}
                      disabled={!isOwner}
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
