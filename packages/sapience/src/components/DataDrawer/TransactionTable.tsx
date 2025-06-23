import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { Badge } from '@foil/ui/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { formatEther } from 'viem';

import AddressDisplay from '~/components/shared/AddressDisplay';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPage } from '~/lib/context/MarketPageProvider';
import { usePositions } from '~/hooks/graphql/usePositions';
import { getChainShortName } from '~/lib/utils/util';

interface TransactionTableProps {
  walletAddress?: string | null;
}

const TransactionTable = ({ walletAddress }: TransactionTableProps) => {
  const {
    chainId,
    collateralAssetTicker,
    marketAddress,
  } = useMarketPage();

  // Fetch positions with transaction data
  // Only fetch if we have a wallet address
  const {
    data: allPositions = [],
    isLoading,
  } = usePositions({
    address: walletAddress || '',
    marketAddress: marketAddress || undefined,
  });

  // Flatten all transactions from positions
  const allTransactions = allPositions.flatMap((position) => 
    position.transactions?.map((tx) => ({ 
      ...tx, 
      position, 
      positionType: position.isLP ? 'LP' : 'Trader' 
    })) || []
  ).sort((a, b) => b.timestamp - a.timestamp);

  // Transactions are already filtered by the usePositions hook based on walletAddress
  const filteredTransactions = allTransactions;

  const getTransactionTypeDisplay = (type: string) => {
    switch (type) {
      case 'ADD_LIQUIDITY':
        return { label: 'Add Liquidity', variant: 'default' as const };
      case 'REMOVE_LIQUIDITY':
        return { label: 'Remove Liquidity', variant: 'secondary' as const };
      case 'LONG':
        return { label: 'Long', variant: 'default' as const };
      case 'SHORT':
        return { label: 'Short', variant: 'destructive' as const };
      case 'SETTLE_POSITION':
        return { label: 'Settle', variant: 'outline' as const };
      default:
        return { label: type, variant: 'outline' as const };
    }
  };

  const getBlockExplorerUrl = (txHash: string) => {
    if (!chainId) return '#';
    
    const chainName = getChainShortName(chainId);
    const baseUrls: Record<string, string> = {
      'ethereum': 'https://etherscan.io/tx/',
      'sepolia': 'https://sepolia.etherscan.io/tx/',
      'polygon': 'https://polygonscan.com/tx/',
      'arbitrum': 'https://arbiscan.io/tx/',
    };
    
    return baseUrls[chainName] ? `${baseUrls[chainName]}${txHash}` : '#';
  };

  if (isLoading) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <p>Loading transactions...</p>
      </div>
    );
  }

  if (filteredTransactions.length === 0) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <p>No transactions found</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTransactions.map((tx) => {
            const typeDisplay = getTransactionTypeDisplay(tx.type);
            // For now, show position collateral amount since individual tx amounts aren't available
            const collateralAmount = tx.position.collateral ? Number(formatEther(BigInt(tx.position.collateral))) : 0;
            
            return (
              <TableRow key={tx.id}>
                <TableCell>
                  <Badge variant={typeDisplay.variant}>
                    {typeDisplay.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <AddressDisplay address={tx.position.owner || ''} />
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
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(tx.timestamp * 1000), { addSuffix: true })}
                  </span>
                </TableCell>
                <TableCell>
                  {tx.transactionHash && (
                    <Link 
                      href={getBlockExplorerUrl(tx.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionTable;