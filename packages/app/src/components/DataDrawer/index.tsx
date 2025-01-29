import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

import LiquidityPositionsTable from '~/components/liquidityPositionsTable';
import TraderPositionsTable from '~/components/traderPositionsTable';
import TransactionTable from '~/components/transactionTable';
import { Drawer, DrawerContent, DrawerTrigger } from '~/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { toast } from '~/hooks/use-toast';
import { API_BASE_URL } from '~/lib/constants/constants';
import { PeriodContext } from '~/lib/context/PeriodProvider';

import DataDrawerFilter from './DataDrawerFilter';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const useAccountData = () => {
  const { address, isConnected } = useAccount();
  const { chainId, address: marketAddress, epoch } = useContext(PeriodContext);

  // Log market details
  useEffect(() => {
    console.log({
      chainId,
      marketAddress,
      epochId: epoch,
    });
  }, [chainId, marketAddress, epoch]);

  return useQuery({
    queryKey: ['accountData', address],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/accounts/${address}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: isConnected,
    refetchInterval: POLLING_INTERVAL,
  });
};

const DataDrawer = () => {
  const { address } = useAccount();
  const [walletAddress, setWalletAddress] = useState<string | null>(
    address || null
  );
  const [showTable, setShowTable] = useState(false);

  const {
    data: accountData,
    error: accountDataError,
    isLoading: isLoadingAccountData,
  } = useAccountData();

  const traderPositions =
    accountData?.positions.filter((position: any) => !position.isLP) || [];
  const lpPositions =
    accountData?.positions.filter((position: any) => position.isLP) || [];
  const transactions = accountData?.transactions || [];

  useEffect(() => {
    if (accountDataError) {
      toast({
        title: 'Error loading account data',
        description: accountDataError.message,
        duration: 5000,
      });
    }
  }, [accountDataError]);

  return (
    <Drawer open={showTable} onOpenChange={setShowTable}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Open data drawer"
          className="fixed left-1/2 -translate-x-1/2 translate-y-0.5 hover:translate-y-0 bottom-[57px] lg:bottom-0 px-4 pb-2 pt-2 bg-background border border-border rounded-t-xl shadow-lg hover:shadow-[0_-5px_10px_-5px_rgba(0,0,0,0.1)] transition-all"
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
        <div className="px-4 pb-4">
          {isLoadingAccountData ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <Tabs defaultValue="transactions" className="w-full">
              <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center mb-3 flex-shrink-0 gap-3">
                <TabsList>
                  <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="trader-positions">
                    Trader Positions
                  </TabsTrigger>
                  <TabsTrigger value="lp-positions">LP Positions</TabsTrigger>
                </TabsList>
                <DataDrawerFilter
                  address={walletAddress}
                  onAddressChange={setWalletAddress}
                />
              </div>
              <TabsContent value="transactions">
                <TransactionTable transactions={transactions} />
              </TabsContent>
              <TabsContent value="trader-positions">
                <TraderPositionsTable positions={traderPositions} />
              </TabsContent>
              <TabsContent value="lp-positions">
                <LiquidityPositionsTable positions={lpPositions} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DataDrawer;
