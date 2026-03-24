'use client';

import { useChainId } from 'wagmi';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import SecondaryListingsTable from '~/components/secondary/SecondaryListingsTable';
import SecondaryTradesTable from '~/components/secondary/SecondaryTradesTable';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

export default function SecondaryPageClient() {
  const walletChainId = useChainId();
  const chainId = walletChainId ?? DEFAULT_CHAIN_ID;

  return (
    <div className="space-y-6 py-6">
      <Tabs defaultValue="listings">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-2xl font-medium">Position Sales</h3>
          <SegmentedTabsList>
            <TabsTrigger value="listings">Active Listings</TabsTrigger>
            <TabsTrigger value="history">Trade History</TabsTrigger>
          </SegmentedTabsList>
        </div>

        <TabsContent value="listings" className="mt-4">
          <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black">
            <SecondaryListingsTable chainId={chainId} />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black">
            <SecondaryTradesTable chainId={chainId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
