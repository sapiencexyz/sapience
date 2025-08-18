'use client';

import { useMemo } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Address } from 'viem';

import { useState } from 'react';
import AddMarketDialog from '~/components/admin/AddMarketDialog';
import ReindexMarketButton from '~/components/admin/ReindexMarketButton';
import MarketItem, {
  useLatestMarketIdForGroup,
} from '~/components/admin/MarketItem';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { parseUrlParameter } from '~/lib/utils/util';
import OwnershipDialog from '~/components/admin/OwnershipDialog';
import EditMarketGroupDialog from '~/components/admin/EditMarketGroupDialog';

export default function AdminGroupPage({
  params,
}: {
  params: { groupId: string };
}) {
  const { data: groups, isLoading, error } = useEnrichedMarketGroups();

  const { marketAddress, chainId } = useMemo(
    () => parseUrlParameter(params.groupId),
    [params.groupId]
  );

  const group = useMemo(() => {
    if (!groups || !chainId || !marketAddress) return undefined;
    return groups.find(
      (g) =>
        g.chainId === chainId &&
        (g.address || '').toLowerCase() === marketAddress.toLowerCase()
    );
  }, [groups, chainId, marketAddress]);

  const latestMarketId = useLatestMarketIdForGroup(group);

  if (isLoading) {
    return (
      <div className="container pt-24 mx-auto px-6 pb-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="container pt-24 mx-auto px-6 pb-6 max-w-4xl">
        <h1 className="text-2xl">{group ? group.question : 'Market Group'}</h1>
        <p className="text-red-500 mt-2">
          {error ? error.message : 'Market group not found.'}
        </p>
      </div>
    );
  }

  return (
    <div className="container pt-24 mx-auto px-6 pb-6 max-w-4xl">
      <div className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl">{group.question}</h1>
        </div>
        <div className="flex items-center gap-2 pt-3">
          <AddMarketDialog
            marketGroupAddress={group.address as Address}
            chainId={group.chainId}
          />
          <ReindexMarketButton
            marketGroupAddress={group.address as string}
            chainId={group.chainId}
          />
          <EditMarketGroupDialog group={group} />
          <EditOwnerInline
            groupAddress={group.address as Address}
            currentOwner={group.owner || undefined}
          />
        </div>
      </div>

      <div className="space-y-3 mt-4">
        {group.markets && group.markets.length > 0 ? (
          group.markets
            .slice()
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
                latestMarketId={latestMarketId}
              />
            ))
        ) : (
          <p className="text-sm text-gray-500">No markets in this group.</p>
        )}
      </div>
    </div>
  );
}

const EditOwnerInline = ({
  groupAddress,
  currentOwner,
}: {
  groupAddress: Address;
  currentOwner?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit Owner
      </Button>
      <OwnershipDialog
        open={open}
        onOpenChange={setOpen}
        marketGroupAddress={groupAddress}
        currentOwner={currentOwner}
      />
    </>
  );
};
