'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import type { Address } from 'viem';

import type { MarketType } from '@sapience/ui/types';
import MarketDeployButton from './MarketDeployButton';
import SettleMarketDialog from './SettleMarketDialog';
import EditMarketDialog from './EditMarketDialog';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useMarketGroupLatestMarket } from '~/hooks/contract/useMarketGroupLatestMarket';

type MarketItemProps = {
  market: MarketType;
  group: EnrichedMarketGroup;
  latestMarketId?: bigint;
};

const MarketItem = ({ market, group, latestMarketId }: MarketItemProps) => {
  const marketId = market.marketId ? Number(market.marketId) : 0;
  const currentMarketId = latestMarketId ? Number(latestMarketId) : 0;
  const shouldShowDeployButton =
    marketId === currentMarketId + 1 &&
    !!market.startingSqrtPriceX96 &&
    !!market.claimStatementYesOrNumeric;

  const isDeployed = !!market.poolAddress;
  const isFutureEndTime = (market.endTimestamp ?? 0) * 1000 > Date.now();

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const renderMarketActions = () => {
    if (group.address && !isDeployed && shouldShowDeployButton) {
      return (
        <MarketDeployButton
          market={market}
          marketGroupAddress={group.address}
          chainId={group.chainId}
        />
      );
    }

    if (group.address && !isDeployed) {
      return (
        <Button size="sm" disabled variant="outline">
          Waiting
        </Button>
      );
    }

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

    if (!group.address) {
      return (
        <Button size="sm" disabled>
          Deploy
        </Button>
      );
    }

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
        <EditMarketDialog market={market} group={group} />
        {renderMarketActions()}
      </div>
    </div>
  );
};

export const useLatestMarketIdForGroup = (group?: EnrichedMarketGroup) => {
  const { latestMarketId } = useMarketGroupLatestMarket(
    (group?.address as Address) || '0x0000000000000000000000000000000000000000',
    group?.chainId || 0
  );
  return latestMarketId;
};

export default MarketItem;
