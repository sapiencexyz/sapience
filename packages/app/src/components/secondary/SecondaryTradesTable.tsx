'use client';

import * as React from 'react';
import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import NumberDisplay from '~/components/shared/NumberDisplay';
import EmptyTabState from '~/components/shared/EmptyTabState';
import PicksPopover from '~/components/shared/PicksPopover';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useEnrichedTokens } from '~/hooks/secondary/useEnrichedTokens';
import {
  useSecondaryTrades,
  type SecondaryTrade,
} from '~/hooks/graphql/useSecondaryTrades';

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-20 rounded bg-white/[0.06] animate-pulse" />
        </TableCell>
      ))}
    </TableRow>
  );
}

interface SecondaryTradesTableProps {
  chainId?: number;
}

export default function SecondaryTradesTable({
  chainId,
}: SecondaryTradesTableProps) {
  const { data: trades, isLoading } = useSecondaryTrades({
    chainId,
  });

  const collateralSymbol = COLLATERAL_SYMBOLS[chainId ?? 0] ?? 'COLLATERAL';

  // Collect unique token addresses for enrichment
  const tokenAddresses = React.useMemo(
    () => (trades ?? []).map((t) => t.token),
    [trades]
  );
  const { map: enrichedMap } = useEnrichedTokens(tokenAddresses);

  if (!isLoading && (!trades || trades.length === 0)) {
    return <EmptyTabState message="NO TRADE HISTORY" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60">
          <TableHead className="h-auto py-3">Executed</TableHead>
          <TableHead className="h-auto py-3">Position</TableHead>
          <TableHead className="h-auto py-3">Buyer</TableHead>
          <TableHead className="h-auto py-3">Seller</TableHead>
          <TableHead className="h-auto py-3">Amount</TableHead>
          <TableHead className="h-auto py-3">Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
          : trades.map((trade: SecondaryTrade) => {
              const amount = parseFloat(formatEther(BigInt(trade.tokenAmount)));
              const price = parseFloat(formatEther(BigInt(trade.price)));
              const date = new Date(trade.executedAt * 1000);
              const enriched = enrichedMap.get(trade.token.toLowerCase());

              return (
                <TableRow key={trade.tradeHash}>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground cursor-default">
                            {formatDistanceToNow(date, { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>{date.toLocaleString()}</span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <PicksPopover
                      picks={enriched?.picks ?? []}
                      fallbackAddress={trade.token}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-brand-white">
                      <EnsAvatar address={trade.buyer} width={20} height={20} />
                      <AddressDisplay address={trade.buyer} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-brand-white">
                      <EnsAvatar
                        address={trade.seller}
                        width={20}
                        height={20}
                      />
                      <AddressDisplay address={trade.seller} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-brand-white">
                      <NumberDisplay value={amount} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono">
                      <NumberDisplay
                        value={price}
                        appendedText={collateralSymbol}
                      />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}
