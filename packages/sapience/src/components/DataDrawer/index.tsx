import { Badge } from '@foil/ui/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@foil/ui/components/ui/drawer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@foil/ui/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import {
  TrophyIcon,
  ListIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import { useState } from 'react';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

import LpPositionsTable from '~/components/profile/LpPositionsTable';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useMarketPage } from '~/lib/context/MarketPageProvider';

import DataDrawerFilter from './DataDrawerFilter';
import MarketLeaderboard from './MarketLeaderboard';

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
  const { marketAddress, chainId, numericMarketId, collateralAssetTicker } =
    useMarketPage();

  // Fetch GraphQL-based positions (includes transaction data)
  const targetAddress = walletAddress || address;
  const {
    data: allPositions = [],
    isLoading: isLoadingPositions,
    error: positionsError,
  } = usePositions({
    address: targetAddress || undefined,
    marketAddress: marketAddress || undefined,
    chainId: chainId || undefined,
  });

  // Filter positions by type
  const lpPositions = allPositions.filter((pos) => pos.isLP);
  const traderPositions = allPositions.filter((pos) => !pos.isLP);

  // Flatten all transactions from positions for the transactions tab
  const allTransactions = allPositions
    .flatMap(
      (position) =>
        position.transactions?.map((tx) => ({
          ...tx,
          position,
          positionType: position.isLP ? 'LP' : 'Trader',
        })) || []
    )
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const getTransactionTypeDisplay = (type: string) => {
    switch (type) {
      case 'ADD_LIQUIDITY':
      case 'addLiquidity':
        return { label: 'Add Liquidity', variant: 'outline' as const };
      case 'REMOVE_LIQUIDITY':
      case 'removeLiquidity':
        return { label: 'Remove Liquidity', variant: 'outline' as const };
      case 'LONG':
      case 'long':
        return { label: 'Long', variant: 'default' as const };
      case 'SHORT':
      case 'short':
        return { label: 'Short', variant: 'default' as const };
      case 'SETTLE_POSITION':
      case 'settlePosition':
        return { label: 'Settle', variant: 'secondary' as const };
      default:
        return { label: type, variant: 'outline' as const };
    }
  };

  const tabTitles: { [key: string]: string } = {
    leaderboard: 'Leaderboard',
    transactions: 'Transactions',
    'trader-positions': 'Trader Positions',
    'lp-positions': 'Liquidity Positions',
  };

  const renderTransactionTable = () => {
    if (isLoadingPositions) {
      return (
        <div className="w-full py-8 text-center text-muted-foreground">
          <p>Loading transactions...</p>
        </div>
      );
    }

    if (positionsError) {
      return (
        <div className="w-full py-8 text-center text-destructive">
          <p>Error loading transactions: {positionsError.message}</p>
        </div>
      );
    }

    if (allTransactions.length === 0) {
      return (
        <div className="w-full py-8 text-center text-muted-foreground">
          <p>No transactions found</p>
          <p className="text-sm mt-2">
            {walletAddress ? `for address ${walletAddress}` : 'for this market'}
          </p>
        </div>
      );
    }

    return (
      <div>
        <div className="rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Position ID</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTransactions.map((tx) => {
                const typeDisplay = getTransactionTypeDisplay(tx.type);
                const collateralAmount = tx.position.collateral
                  ? Number(formatEther(BigInt(tx.position.collateral)))
                  : 0;

                return (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(
                          new Date((tx.timestamp || 0) * 1000),
                          {
                            addSuffix: true,
                          }
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeDisplay.variant}>
                        {typeDisplay.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <NumberDisplay value={Math.abs(collateralAmount)} />
                        <span className="text-muted-foreground text-sm">
                          {collateralAssetTicker}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        #{tx.position.positionId}
                      </span>
                    </TableCell>
                    <TableCell>
                      <AddressDisplay address={tx.position.owner || ''} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
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
              <div className="max-h-96 overflow-y-auto">
                <MarketLeaderboard
                  marketAddress={marketAddress}
                  chainId={chainId}
                  marketId={numericMarketId?.toString() || null}
                />
              </div>
            </TabsContent>
            <TabsContent value="transactions">
              <div className="max-h-96 overflow-y-auto">
                {renderTransactionTable()}
              </div>
            </TabsContent>
            <TabsContent value="trader-positions">
              <div className="max-h-96 overflow-y-auto">
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
                    showHeader={false}
                  />
                )}
              </div>
            </TabsContent>
            <TabsContent value="lp-positions">
              <div className="max-h-96 overflow-y-auto">
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
                    showHeader={false}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DataDrawer;
