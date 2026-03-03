'use client';

import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Badge } from '@sapience/ui/components/ui/badge';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import EmptyTabState from '~/components/shared/EmptyTabState';
import {
  useSecondaryTradesByAddress,
  type SecondaryTrade,
} from '~/hooks/graphql/useSecondaryTrades';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

function getExplorerTxUrl(chainId: number, txHash: string): string {
  if (chainId === 13374202) {
    return `https://explorer.etherealtest.net/tx/${txHash}`;
  }
  return `#`;
}

interface SecondaryTradesTableProps {
  address?: string;
  chainId?: number;
}

export default function SecondaryTradesTable({
  address,
  chainId,
}: SecondaryTradesTableProps) {
  const { data: trades, isLoading } = useSecondaryTradesByAddress({
    address,
    chainId,
  });

  const collateralSymbol = COLLATERAL_SYMBOLS[chainId ?? 0] ?? 'COLLATERAL';

  if (isLoading) {
    return <Loader />;
  }

  if (!trades || trades.length === 0) {
    return <EmptyTabState message="No secondary trades yet" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Token</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Tx Hash</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade: SecondaryTrade) => {
          const isSeller =
            trade.seller.toLowerCase() === address?.toLowerCase();
          const role = isSeller ? 'Seller' : 'Buyer';
          const amount = parseFloat(formatEther(BigInt(trade.tokenAmount)));
          const price = parseFloat(formatEther(BigInt(trade.price)));
          const date = new Date(trade.executedAt * 1000);

          return (
            <TableRow key={trade.tradeHash}>
              <TableCell className="font-mono text-xs">
                {trade.token.slice(0, 6)}…{trade.token.slice(-4)}
              </TableCell>
              <TableCell>
                <Badge variant={isSeller ? 'default' : 'secondary'}>
                  {role}
                </Badge>
              </TableCell>
              <TableCell>
                <NumberDisplay value={amount} />
              </TableCell>
              <TableCell>
                <NumberDisplay value={price} appendedText={collateralSymbol} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {date.toLocaleDateString()}
              </TableCell>
              <TableCell>
                <a
                  href={getExplorerTxUrl(trade.chainId, trade.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue-500 hover:underline"
                >
                  {trade.txHash.slice(0, 6)}…{trade.txHash.slice(-4)}
                </a>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
