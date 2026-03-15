'use client';

import { useChainId } from 'wagmi';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import SecondaryListingsTable from '~/components/secondary/SecondaryListingsTable';
import SecondaryTradesTable from '~/components/secondary/SecondaryTradesTable';
import { useAccount } from 'wagmi';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';

export default function SecondaryPageClient() {
  const walletChainId = useChainId();
  const chainId = walletChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Secondary Market</h1>
        <p className="text-muted-foreground">
          Buy and sell position tokens from other traders
        </p>
      </div>

      <Tabs defaultValue="listings">
        <TabsList>
          <TabsTrigger value="listings">Active Listings</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="mt-4">
          <SecondaryListingsTable chainId={chainId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SecondaryTradesTable address={address} chainId={chainId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
