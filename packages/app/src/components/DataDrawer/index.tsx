import {
  TrophyIcon,
  ListIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import { useContext, useState } from 'react';
import { useAccount } from 'wagmi';

import LiquidityPositionsTable from '~/components/liquidityPositionsTable';
import TraderPositionsTable from '~/components/traderPositionsTable';
import TransactionTable from '~/components/transactionTable';
import { Drawer, DrawerContent, DrawerTrigger } from '~/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { PeriodContext } from '~/lib/context/PeriodProvider';

import DataDrawerFilter from './DataDrawerFilter';

const DataDrawer = () => {
  const { address } = useAccount();
  const [walletAddress, setWalletAddress] = useState<string | null>(
    address || null
  );
  const [showTable, setShowTable] = useState(false);
  const [selectedTab, setSelectedTab] = useState('transactions');
  const periodContext = useContext(PeriodContext);

  const tabTitles: { [key: string]: string } = {
    leaderboard: 'Leaderboard',
    transactions: 'Transactions',
    'trader-positions': 'Trader Positions',
    'lp-positions': 'Liquidity Positions',
  };

  return (
    <Drawer open={showTable} onOpenChange={setShowTable}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Open data drawer"
          className="fixed left-1/2 -translate-x-1/2 translate-y-0.5 hover:translate-y-0 bottom-[69px] lg:bottom-0 px-4 pb-2 pt-2 bg-background border border-border rounded-t-xl shadow-lg hover:shadow-[0_-5px_10px_-5px_rgba(0,0,0,0.1)] transition-all"
        >
          <svg
            width="140"
            height="32"
            viewBox="0 0 100 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 9L50 3L90 9"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              className="text-muted"
            />
          </svg>
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-3">
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
              <TransactionTable
                walletAddress={walletAddress}
                periodContext={periodContext}
              />
            </TabsContent>
            <TabsContent value="trader-positions">
              <TraderPositionsTable
                walletAddress={walletAddress}
                periodContext={periodContext}
              />
            </TabsContent>
            <TabsContent value="lp-positions">
              <LiquidityPositionsTable
                walletAddress={walletAddress}
                periodContext={periodContext}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DataDrawer;
