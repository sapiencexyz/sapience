'use client';

import type { Address } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';

export default function UserParlaysTable({
  showHeaderText = true,
}: {
  account: Address;
  chainId?: number;
  showHeaderText?: boolean;
  marketAddressFilter?: string;
}) {
  type MockLeg = { question: string; choice: 'Yes' | 'No' };
  type MockParlay = {
    positionId: number;
    legs: MockLeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // timestamp in ms
    status: 'active' | 'won' | 'lost';
  };

  const mockParlays: MockParlay[] = [
    {
      positionId: 101234,
      direction: 'Long',
      endsAt: Date.now() + 1000 * 60 * 60 * 3, // 3d (rounded display)
      status: 'active',
      legs: [
        { question: 'Will BTC close above $60k on Friday?', choice: 'Yes' },
        { question: 'Will the S&P 500 be up this week?', choice: 'No' },
      ],
    },
    {
      positionId: 101235,
      direction: 'Short',
      endsAt: Date.now() - 1000 * 60 * 60 * 2, // expired 2h ago
      status: 'won',
      legs: [
        { question: 'Will ETH average gas < 25 gwei tomorrow?', choice: 'Yes' },
        { question: 'Will US CPI YoY be above 3% next print?', choice: 'No' },
        {
          question: 'Will SOL flip BNB in market cap this month?',
          choice: 'No',
        },
      ],
    },
    {
      positionId: 101236,
      direction: 'Long',
      endsAt: Date.now() - 1000 * 60 * 5, // expired 5m ago
      status: 'lost',
      legs: [{ question: 'Will BTC dominance rise next week?', choice: 'Yes' }],
    },
  ];

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      <div className="rounded border">
        <Table>
          <TableHeader className="bg-muted/30 text-sm font-medium text-muted-foreground border-b">
            <TableRow>
              <TableHead>Position ID</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockParlays.map((parlay) => (
              <TableRow key={parlay.positionId} className="align-top">
                <TableCell className="whitespace-nowrap">
                  #{parlay.positionId}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {parlay.legs.map((leg, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium">{leg.question}</span>{' '}
                        <span
                          className={
                            leg.choice === 'Yes'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          ({leg.choice})
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {parlay.direction === 'Long'
                    ? 'Conditions will be met'
                    : 'Not all conditions will be met'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {parlay.status === 'active' && (
                    <Button size="sm" variant="outline" disabled>
                      {`Ends In ${Math.max(1, Math.ceil((parlay.endsAt - Date.now()) / (1000 * 60 * 60 * 24)))} Days`}
                    </Button>
                  )}
                  {parlay.status === 'won' && (
                    <Button size="sm">Claim Winnings</Button>
                  )}
                  {parlay.status === 'lost' && (
                    <Button size="sm" variant="outline" disabled>
                      Parlay Lost
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
