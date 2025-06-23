import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@foil/ui/components/ui/drawer';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@foil/ui/components/ui/tabs';
import {
  TrophyIcon,
  ListIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import LpPositionsTable from '~/components/profile/LpPositionsTable';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import { useMarketPage } from '~/lib/context/MarketPageProvider';
import { usePositions } from '~/hooks/graphql/usePositions';

import DataDrawerFilter from './DataDrawerFilter';
import TransactionTable from './TransactionTable';

interface DataDrawerProps {
  trigger?: React.ReactNode;
}

const DataDrawer = ({ trigger }: DataDrawerProps) => {
  const { address } = useAccount();
  const [walletAddress, setWalletAddress] = useState<string | null>(
    address || null
  );
  const [showTable, setShowTable] = useState(false);
  const [selectedTab, setSelectedTab] = useState('transactions');
  
  // Get market context data
  const {
    marketAddress,
    chainId,
    numericMarketId,
  } = useMarketPage();

  // Fetch GraphQL-based positions (includes transaction data)
  // Only fetch if we have a wallet address (either selected or connected)
  const targetAddress = walletAddress || address;
  const {
    data: allPositions = [],
    isLoading: isLoadingPositions,
  } = usePositions({
    address: targetAddress || '',
    marketAddress: marketAddress || undefined,
  });

  // Filter positions by type
  const lpPositions = allPositions.filter(pos => pos.isLP);
  const traderPositions = allPositions.filter(pos => !pos.isLP);

  const tabTitles: { [key: string]: string } = {
    leaderboard: 'Leaderboard',
    transactions: 'Transactions',
    'trader-positions': 'Trader Positions',
    'lp-positions': 'Liquidity Positions',
  };

  return (
    <Drawer open={showTable} onOpenChange={setShowTable}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <div className="px-4 py-4">
          <Tabs
            defaultValue="transactions"
            className="w-full"
            onValueChange={setSelectedTab}
          >
            <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center mb-3 flex-shrink-0 gap-3">
              <TabsList>
                <TabsTrigger value="leaderboard">
                  <TrophyIcon className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Leaderboard</span>
                </TabsTrigger>
                <TabsTrigger value="transactions">
                  <ListIcon className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Transactions</span>
                </TabsTrigger>
                <TabsTrigger value="trader-positions">
                  <ArrowLeftRightIcon className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Trader Positions</span>
                </TabsTrigger>
                <TabsTrigger value="lp-positions">
                  <DropletsIcon className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Liquidity Positions</span>
                </TabsTrigger>
              </TabsList>
              <DataDrawerFilter
                address={walletAddress}
                onAddressChange={setWalletAddress}
              />
            </div>
            <h2 className="text-2xl font-semibold mt-6 md:hidden">
              {tabTitles[selectedTab]}
            </h2>
            <TabsContent value="leaderboard">
              <div className="w-full py-8 text-center text-muted-foreground">
                <TrophyIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
                Coming soon
              </div>
            </TabsContent>
            <TabsContent value="transactions">
              <TransactionTable walletAddress={walletAddress} />
            </TabsContent>
            <TabsContent value="trader-positions">
              {isLoadingPositions ? (
                <div className="w-full py-8 text-center text-muted-foreground">
                  <p>Loading positions...</p>
                </div>
              ) : (
                <TraderPositionsTable
                  positions={traderPositions}
                  parentMarketAddress={marketAddress || undefined}
                  parentChainId={chainId || undefined}
                  parentMarketId={numericMarketId || undefined}
                />
              )}
            </TabsContent>
            <TabsContent value="lp-positions">
              {isLoadingPositions ? (
                <div className="w-full py-8 text-center text-muted-foreground">
                  <p>Loading positions...</p>
                </div>
              ) : (
                <LpPositionsTable
                  positions={lpPositions}
                  parentMarketAddress={marketAddress || undefined}
                  parentChainId={chainId || undefined}
                  parentMarketId={numericMarketId || undefined}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DataDrawer;