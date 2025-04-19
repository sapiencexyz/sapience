import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';

import NumberDisplay from '~/components/shared/NumberDisplay';

interface Position {
  id: string;
  positionId: string;
  collateral: string;
  baseToken: string;
  borrowedBaseToken?: string;
  isLP: boolean;
  isSettled: boolean;
  lpBaseToken?: string;
  market: {
    question: string;
  };
  [key: string]: any;
}

interface PositionsTableProps {
  positions: Position[];
}

export default function PositionsTable({ positions }: PositionsTableProps) {
  if (!positions || positions.length === 0) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          No positions found for this address
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Question</TableHead>
            <TableHead>Prediction</TableHead>
            <TableHead>Wager</TableHead>
            <TableHead>Profit/Loss</TableHead>
            <TableHead>Potential Profit</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position: Position) => (
            <TableRow key={position.id}>
              <TableCell>
                {position.market.question || 'No question provided'}
              </TableCell>
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
                <NumberDisplay value={Number(position.collateral) / 10 ** 18} />{' '}
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
                >
                  {position.isSettled ? 'Claim' : 'Sell'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
