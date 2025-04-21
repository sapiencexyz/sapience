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

interface LpPositionsTableProps {
  positions: Position[];
}

export default function LpPositionsTable({ positions }: LpPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  // Return null if there are no positions to display
  if (!positions || positions.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="font-medium mb-4">Liquidity Positions</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Wager</TableHead>
              <TableHead>Position Value</TableHead>
              <TableHead>Max Profit</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position: Position) => {
              let displayQuestion = 'Legacy Market'; // Default fallback

              if (
                position.market?.marketGroup?.optionNames &&
                position.market.marketGroup.optionNames.length > 0 &&
                position.market.marketGroup.question
              ) {
                displayQuestion = position.market.marketGroup.question;
              } else if (position.market?.question) {
                displayQuestion = position.market.question;
              }

              const isOwner =
                connectedAddress &&
                position.owner &&
                connectedAddress.toLowerCase() === position.owner.toLowerCase();

              return (
                <TableRow key={position.id}>
                  <TableCell>{displayQuestion}</TableCell>
                  <TableCell>
                    {position.isLP ? (
                      <span>
                        <NumberDisplay
                          value={
                            (position.lpBaseToken
                              ? Number(position.lpBaseToken)
                              : Number(position.baseToken) -
                                Number(position.borrowedBaseToken || 0)) /
                            10 ** 18
                          }
                        />{' '}
                        Ggas
                      </span>
                    ) : (
                      <span>
                        <NumberDisplay
                          value={
                            (Number(position.baseToken) -
                              Number(position.borrowedBaseToken || 0)) /
                            10 ** 18
                          }
                        />{' '}
                        Ggas
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <NumberDisplay
                      value={Number(position.collateral) / 10 ** 18}
                    />{' '}
                    wstETH
                  </TableCell>
                  <TableCell>
                    {/* Actual or realized profit/loss */}
                    {position.isSettled ? '+' : ''}
                    <NumberDisplay value={0} /> wstETH
                  </TableCell>
                  <TableCell>
                    {/* Potential profit calculation */}
                    <NumberDisplay
                      value={(Number(position.collateral) / 10 ** 18) * 0.2}
                    />{' '}
                    wstETH
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
