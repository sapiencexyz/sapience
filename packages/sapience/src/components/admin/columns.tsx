'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import type { MarketType } from '@foil/ui/types';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import type { Address } from 'viem';

import { useMarketGroupLatestEpoch } from '~/hooks/contract/useMarketGroupLatestEpoch';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { shortenAddress } from '~/lib/utils/util';

import AddMarketDialog from './AddMarketDialog';
import MarketDeployButton from './MarketDeployButton';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import OwnershipDialog from './OwnershipDialog';
import ReindexMarketButton from './ReindexMarketButton';
import SettleMarketDialog from './SettleMarketDialog';

const getChainShortName = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return 'eth';
    case 10:
      return 'op';
    case 8453:
      return 'base';
    case 42161:
      return 'arb';
    case 137:
      return 'poly';
    default:
      return chainId.toString();
  }
};

const MarketItem = ({
  market,
  group,
  latestEpochId,
}: {
  market: MarketType;
  group: EnrichedMarketGroup;
  latestEpochId?: bigint;
}) => {
  const marketId = market.marketId ? Number(market.marketId) : 0;
  const currentEpochId = latestEpochId ? Number(latestEpochId) : 0;
  const shouldShowDeployButton =
    marketId > currentEpochId &&
    !!market.startingSqrtPriceX96 &&
    !!market.marketParams?.claimStatement;

  const isDeployed = !!market.poolAddress;
  const isFutureEndTime = (market.endTimestamp ?? 0) * 1000 > Date.now();

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const renderMarketActions = () => {
    // Case 1: Deployed group but market not yet deployed
    if (group.address && !isDeployed && shouldShowDeployButton) {
      return (
        <MarketDeployButton
          market={market}
          marketGroupAddress={group.address}
          chainId={group.chainId}
        />
      );
    }

    // Case 2: Deployed group, market deployed but waiting
    if (group.address && !isDeployed) {
      return (
        <Button size="sm" disabled variant="outline">
          Waiting
        </Button>
      );
    }

    // Case 3: Deployed group, market deployed, past end time, needs settlement
    if (group.address && isDeployed && !isFutureEndTime) {
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={market.settled ?? false}>
              {market.settled ? 'Settled' : 'Settle'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{market.question}</DialogTitle>
            </DialogHeader>
            <SettleMarketDialog market={market} marketGroup={group} />
          </DialogContent>
        </Dialog>
      );
    }

    // Case 4: Group not deployed yet
    if (!group.address) {
      return (
        <Button size="sm" disabled>
          Deploy
        </Button>
      );
    }

    // Default case: No action needed
    return null;
  };

  return (
    <div
      key={`${group.address || group.id}-${market.marketId || market.id}`}
      className="flex items-center justify-between py-2 gap-4s"
    >
      <span className="font-medium items-center flex gap-2">
        <small className="text-muted-foreground">
          #{market.marketId || market.id}
        </small>{' '}
        {market.question || 'No question available'}
      </span>
      <div className="flex items-center space-x-4">
        {isDeployed && isFutureEndTime && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            ends {formatTimestamp(market.endTimestamp ?? 0)}
          </span>
        )}
        {renderMarketActions()}
      </div>
    </div>
  );
};

const ActionsCell = ({ row }: { row: Row<EnrichedMarketGroup> }) => {
  const group = row.original as EnrichedMarketGroup;
  const [ownershipDialogOpen, setOwnershipDialogOpen] = useState(false);
  const [marketsDialogOpen, setMarketsDialogOpen] = useState(false);
  const { latestEpochId } = useMarketGroupLatestEpoch(
    group.address as Address,
    group.chainId
  );

  if (group.address) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Dialog open={marketsDialogOpen} onOpenChange={setMarketsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Markets
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>Markets for {group.question}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {group.markets.length > 0 ? (
                group.markets
                  .sort((a, b) => {
                    const aId = a.marketId ? Number(a.marketId) : Number(a.id);
                    const bId = b.marketId ? Number(b.marketId) : Number(b.id);
                    return aId - bId;
                  })
                  .map((market) => (
                    <MarketItem
                      key={`${group.address || group.id}-${market.marketId || market.id}`}
                      market={market}
                      group={group}
                      latestEpochId={latestEpochId}
                    />
                  ))
              ) : (
                <p className="text-sm text-gray-500 px-4 py-2">
                  No markets in this group.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <OwnershipDialog
          open={ownershipDialogOpen}
          onOpenChange={setOwnershipDialogOpen}
          marketGroupAddress={group.address as Address}
          currentOwner={group.owner ?? undefined}
        />
        <AddMarketDialog
          marketGroupAddress={group.address as Address}
          chainId={group.chainId}
        />
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/forecasting/${getChainShortName(group.chainId)}:${group.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View
          </a>
        </Button>
        <ReindexMarketButton
          marketGroupAddress={group.address}
          chainId={group.chainId}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="text-sm text-gray-500">Chain ID: {group.chainId}</span>
      <MarketGroupDeployButton group={group} />
    </div>
  );
};

const columns: ColumnDef<EnrichedMarketGroup>[] = [
  {
    accessorKey: 'question',
    header: 'Question',
    cell: ({ row }) => {
      const group = row.original;
      return (
        <div className="font-medium flex items-center gap-2">
          {group.category && (
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.category.color }}
              title={group.category.name}
            />
          )}
          <span>{group.question}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'address',
    header: 'Address',
    cell: ({ row }) => {
      const group = row.original;
      if (!group.address) {
        return <span className="text-muted-foreground">Not deployed</span>;
      }
      return (
        <div>
          {getChainShortName(group.chainId)}:{shortenAddress(group.address)}
        </div>
      );
    },
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell: ({ row }) => {
      const group = row.original;
      if (!group.owner) {
        return <span className="text-muted-foreground">N/A</span>;
      }
      return <div>{shortenAddress(group.owner)}</div>;
    },
  },
  {
    id: 'actions',
    cell: ActionsCell,
    header: () => <div className="text-right">Actions</div>,
  },
];

export default columns;
