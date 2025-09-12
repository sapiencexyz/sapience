import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import {
  TrophyIcon,
  ListIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import { useState } from 'react';
import { formatEther } from 'viem';

import DataDrawerFilter from './DataDrawerFilter';
import MarketLeaderboard from './MarketLeaderboard';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useMarketPage } from '~/lib/context/MarketPageProvider';

const CenteredMessage = ({
  children,
  className = 'text-muted-foreground',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`w-full py-8 text-center ${className}`}>
    <p>{children}</p>
  </div>
);

interface TransactionTypeDisplay {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}

const getTransactionTypeDisplay = (type: string): TransactionTypeDisplay => {
  switch (type) {
    case 'ADD_LIQUIDITY':
    case 'addLiquidity':
      return { label: 'Add Liquidity', variant: 'outline' as const };
    case 'REMOVE_LIQUIDITY':
    case 'removeLiquidity':
      return { label: 'Remove Liquidity', variant: 'outline' as const };
    case 'LONG':
    case 'long':
      return {
        label: 'Long',
        variant: 'outline' as const,
        className: 'border-green-500/40 bg-green-500/10 text-green-600',
      };
    case 'SHORT':
    case 'short':
      return {
        label: 'Short',
        variant: 'outline' as const,
        className: 'border-red-500/40 bg-red-500/10 text-red-600',
      };
    case 'SETTLE_POSITION':
    case 'settlePosition':
      return { label: 'Settle', variant: 'secondary' as const };
    default:
      return { label: type, variant: 'outline' as const };
  }
};

const MarketDataTables = () => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('transactions');

  // Get market context data
  const {
    marketAddress,
    chainId,
    numericMarketId,
    collateralAssetTicker,
    marketData,
  } = useMarketPage();

  // Fetch GraphQL-based positions (includes transaction data)
  // Only use walletAddress if it's explicitly set (not null)
  // If walletAddress is null, it means "All Market Data" is selected
  const targetAddress =
    walletAddress !== null ? walletAddress?.toLowerCase() : undefined;

  const {
    data: allPositions = [],
    isLoading: isLoadingPositions,
    error: positionsError,
  } = usePositions({
    address: targetAddress,
    marketAddress: marketData?.marketGroup?.address || undefined,
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
    .sort(
      (a, b) =>
        (new Date(b.createdAt).getTime() || 0) -
        (new Date(a.createdAt).getTime() || 0)
    );

  const tabTitles: { [key: string]: string } = {
    leaderboard: 'Leaderboard',
    transactions: 'Transactions',
    'trader-positions': 'Trader Positions',
    'lp-positions': 'Liquidity Positions',
  };

  const renderTransactionTable = () => {
    if (isLoadingPositions) {
      return <CenteredMessage>Loading transactions...</CenteredMessage>;
    }

    if (positionsError) {
      return (
        <CenteredMessage className="text-destructive">
          Error loading transactions: {positionsError.message}
        </CenteredMessage>
      );
    }

    if (allTransactions.length === 0) {
      return (
        <CenteredMessage>
          No transactions found{' '}
          {walletAddress ? `for address ${walletAddress}` : 'for this market'}
        </CenteredMessage>
      );
    }

    return (
      <div>
        <div className="rounded border bg-background dark:bg-muted/50">
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
                        {formatDistanceToNow(new Date(tx.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={typeDisplay.variant}
                        className={typeDisplay.className}
                      >
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

  const renderPositionsContent = (
    positions: typeof lpPositions,
    positionType: 'trader' | 'liquidity'
  ) => {
    if (isLoadingPositions) {
      return <CenteredMessage>Loading positions...</CenteredMessage>;
    }
    if (positionsError) {
      return (
        <CenteredMessage className="text-destructive">
          Error loading positions: {positionsError.message}
        </CenteredMessage>
      );
    }
    if (positions.length === 0) {
      return (
        <CenteredMessage>
          No {positionType} positions found{' '}
          {walletAddress ? `for address ${walletAddress}` : 'for this market'}
        </CenteredMessage>
      );
    }
    if (positionType === 'trader') {
      return (
        <TraderPositionsTable
          positions={traderPositions}
          parentMarketAddress={marketAddress || undefined}
          parentChainId={chainId || undefined}
          parentMarketId={numericMarketId || undefined}
          showHeader={false}
        />
      );
    }
    return (
      <LpPositionsTable
        positions={lpPositions}
        parentMarketAddress={marketAddress || undefined}
        parentChainId={chainId || undefined}
        parentMarketId={numericMarketId || undefined}
        showHeader={false}
      />
    );
  };

  return (
    <div>
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
          <div>
            <MarketLeaderboard
              marketAddress={marketAddress}
              chainId={chainId}
              marketId={numericMarketId?.toString() || null}
            />
          </div>
        </TabsContent>
        <TabsContent value="transactions">
          <div>{renderTransactionTable()}</div>
        </TabsContent>
        <TabsContent value="trader-positions">
          <div>{renderPositionsContent(traderPositions, 'trader')}</div>
        </TabsContent>
        <TabsContent value="lp-positions">
          <div>{renderPositionsContent(lpPositions, 'liquidity')}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MarketDataTables;
