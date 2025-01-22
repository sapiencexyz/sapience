import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Download } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Market } from '~/lib/context/MarketListProvider';

import { AddressCell } from './AddressCell';
import { BondCell } from './BondCell';
import { PublicCell } from './PublicCell';
import { SettleCell } from './SettleCell';
import { SettlementPriceCell } from './SettlementPriceCell';
import type { MissingBlocks } from './types';

export const getColumns = (
  loadingAction: { [key: string]: boolean },
  updateMarketPrivacy: (market: Market) => void,
  handleReindex: (
    reindexType: 'price' | 'events',
    marketAddress: string,
    epochId: number,
    chainId: number
  ) => void,
  missingBlocks: MissingBlocks
): ColumnDef<any>[] => [
  {
    id: 'isPublic',
    header: 'Public',
    cell: ({ row }) => (
      <PublicCell
        isPublic={row.original.isPublic}
        market={row.original.market}
        loading={loadingAction[row.original.marketAddress]}
        onUpdate={updateMarketPrivacy}
      />
    ),
  },
  {
    id: 'vaultAddress',
    header: 'Vault Address',
    cell: ({ row }) => (
      <AddressCell
        address={row.original.vaultAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'marketAddress',
    header: 'Market Address',
    cell: ({ row }) => (
      <AddressCell
        address={row.original.marketAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'chainId',
    header: 'Chain',
    accessorKey: 'chainId',
  },
  {
    id: 'epochId',
    header: 'Epoch',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.epochId}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={() =>
                  handleReindex(
                    'events',
                    row.original.marketAddress,
                    row.original.epochId,
                    row.original.chainId
                  )
                }
                className="h-6 w-6 p-0"
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reindex Events</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
  },
  {
    id: 'endTimestamp',
    header: 'Ends',
    accessorKey: 'endTimestamp',
    cell: ({ getValue }) => {
      const timestamp = getValue() as number;
      const date = new Date(timestamp * 1000);
      const now = new Date();
      return date < now
        ? `${formatDistanceToNow(date)} ago`
        : `in ${formatDistanceToNow(date)}`;
    },
  },
  {
    id: 'missingPriceBlocks',
    header: 'Missing Price Blocks',
    cell: ({ row }) => {
      const key = `${row.original.marketAddress}-${row.original.epochId}`;
      const blocks = missingBlocks[key]?.resourcePrice;

      return (
        <div className="flex items-center gap-2">
          <span>{blocks ? blocks.length.toLocaleString() : 'Loading...'}</span>
          {blocks && blocks.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={() =>
                      handleReindex(
                        'price',
                        row.original.marketAddress,
                        row.original.epochId,
                        row.original.chainId
                      )
                    }
                    className="h-6 w-6 p-0"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reindex Missing Price Blocks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  {
    id: 'settlementPrice',
    header: 'Settlement Price',
    cell: ({ row }) => (
      <SettlementPriceCell market={row.original.market} epoch={row.original} />
    ),
  },
  {
    id: 'bondStatus',
    header: 'Bond',
    cell: ({ row }) => (
      <BondCell
        market={row.original.market}
        epoch={row.original}
        bondAmount={row.original.market.marketParams?.bondAmount}
        bondCurrency={row.original.market.marketParams?.bondCurrency}
        vaultAddress={row.original.vaultAddress}
      />
    ),
  },
  {
    id: 'settlement',
    header: 'Settle',
    cell: ({ row }) => (
      <SettleCell
        market={row.original.market}
        epoch={row.original}
        missingBlocks={missingBlocks}
      />
    ),
  },
];
