import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Download, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { zeroAddress } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import erc20ABI from '~/lib/erc20abi.json';
import type { Market } from '~/lib/context/FoilProvider';
import { useResources } from '~/lib/hooks/useResources';

import AddressCell from './AddressCell';
import PublicCell from './PublicCell';
import SettleCell from './SettleCell';
import type { MissingBlocks, BondCellProps } from './types';
import { useSettlementPrice } from '~/lib/hooks/useSettlementPrice';
import { useFoil } from '~/lib/context/FoilProvider';

// ResourceCell component to display resource name and icon
const ResourceCell = ({ marketAddress, chainId }: { marketAddress: string; chainId: number }) => {
  const { data: resources } = useResources();
  
  if (!resources) {
    return <span>Loading...</span>;
  }
  
  // Find the resource that contains this market
  const resource = resources.find(resource => 
    resource.markets.some(market => 
      market.address === marketAddress && market.chainId === chainId
    )
  );
  
  if (!resource) {
    return <span>Unknown</span>;
  }
  
  return (
    <div className="flex items-center gap-2">
      {resource.iconPath && (
        <Image
          src={resource.iconPath}
          alt={resource.name}
          width={20}
          height={20}
          className="object-contain"
        />
      )}
      <span>{resource.name}</span>
    </div>
  );
};

// BondApproveButton component to handle bond approval
const BondApproveButton = ({ 
  market, 
  bondAmount, 
  bondCurrency, 
  vaultAddress 
}: Omit<BondCellProps, 'epoch'>) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);

  // Determine the target address for approval
  // Use vault address if it exists, otherwise use market address
  const targetAddress = market.vaultAddress !== zeroAddress 
    ? market.vaultAddress 
    : market.address;

  // Exit early if required props are not available
  if (!bondAmount || !bondCurrency) {
    return <span>Loading...</span>;
  }

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, targetAddress],
    account: address || zeroAddress,
    chainId: market.chainId,
    query: {
      enabled: !!address && !!bondCurrency,
    },
  });

  const { writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        console.error('Failed to approve: ', error);
        setIsApproving(false);
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: (error as Error).message,
        });
      },
      onSuccess: () => {
        toast({
          title: 'Approval successful',
          description: 'Bond amount has been approved',
        });
        setIsApproving(false);
        refetchAllowance();
      },
    },
  });

  const handleApprove = () => {
    setIsApproving(true);
    approveWrite({
      abi: erc20ABI,
      address: bondCurrency as `0x${string}`,
      functionName: 'approve',
      args: [targetAddress, bondAmount],
      chainId: market.chainId,
    });
  };

  const requiresApproval = !allowance || bondAmount > (allowance as bigint);

  if (!requiresApproval) {
    return <span>✓ Approved</span>;
  }

  return (
    <Button size="xs" onClick={handleApprove} disabled={isApproving}>
      {isApproving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
      Approve Bond
    </Button>
  );
};

const getColumns = (
  loadingAction: { [key: string]: boolean },
  updateMarketPrivacy: (market: Market, epochId: number) => void,
  handleReindex: (
    reindexType: 'price' | 'events',
    marketAddress: string,
    epochId: number,
    chainId: number
  ) => void,
  missingBlocks: MissingBlocks
): ColumnDef<any>[] => [
  {
    id: 'isPublic',
    header: 'Public',
    cell: ({ row }) => (
      <PublicCell
        isPublic={row.original.public}
        loading={
          loadingAction[`${row.original.marketAddress}-${row.original.epochId}`]
        }
        market={row.original.market}
        epochId={row.original.epochId}
        onUpdate={updateMarketPrivacy}
      />
    ),
  },
  {
    id: 'resource',
    header: 'Resource',
    cell: ({ row }) => (
      <ResourceCell 
        marketAddress={row.original.marketAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'endTimestamp',
    header: 'Ends',
    accessorKey: 'endTimestamp',
    cell: ({ getValue }) => {
      const timestamp = getValue() as number;
      const date = new Date(timestamp * 1000);
      const now = new Date();
      return date < now
        ? `${formatDistanceToNow(date)} ago`
        : `in ${formatDistanceToNow(date)}`;
    },
  },
  {
    id: 'vaultAddress',
    header: 'Market Owner',
    cell: ({ row }) => {
      // Get the actual vaultAddress from the market to compare
      const actualVaultAddress = row.original.market.vaultAddress;
      const isVault = actualVaultAddress !== zeroAddress;
      
      return (
        <div className="flex items-center gap-2">
          <AddressCell
            address={row.original.vaultAddress}
            chainId={row.original.chainId}
          />
          {isVault && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className="h-5 w-5 rounded bg-blue-500/20 border border-blue-500 flex items-center justify-center">
                    <span className="text-blue-500 text-xs font-medium">V</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Vault Contract</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  {
    id: 'marketAddress',
    header: 'Market Address',
    cell: ({ row }) => (
      <AddressCell
        address={row.original.marketAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'chainId',
    header: 'Chain',
    accessorKey: 'chainId',
  },
  {
    id: 'isYin',
    header: 'Yin',
    cell: ({ row }) => (
      <span>{row.original.market.isYin ? '✓' : '✗'}</span>
    ),
  },
  {
    id: 'isCumulative',
    header: 'Cumulative',
    cell: ({ row }) => (
      <span>{row.original.market.isCumulative ? '✓' : '✗'}</span>
    ),
  },
  {
    id: 'epochId',
    header: 'Period',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.epochId}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={() =>
                  handleReindex(
                    'events',
                    row.original.marketAddress,
                    row.original.epochId,
                    row.original.chainId
                  )
                }
                className="h-5 w-5 p-0"
              >
                <Download className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reindex Events</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
  },
  {
    id: 'missingPriceBlocks',
    header: 'Missing Price Blocks',
    cell: ({ row }) => {
      const key = `${row.original.marketAddress}-${row.original.epochId}`;
      const blocks = missingBlocks[key]?.resourcePrice;

      return (
        <div className="flex items-center gap-2">
          <span>{blocks ? blocks.length.toLocaleString() : 'Loading...'}</span>
          {blocks && blocks.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={() =>
                      handleReindex(
                        'price',
                        row.original.marketAddress,
                        row.original.epochId,
                        row.original.chainId
                      )
                    }
                    className="h-5 w-5 p-0"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reindex Missing Price Blocks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  // Split Settlement Price into separate columns
  {
    id: 'settlementPriceGwei',
    header: 'Settlement Price (gwei)',
    cell: ({ row }) => {
      const { latestPrice, isLoading } = useSettlementPrice(
        row.original.market,
        row.original
      );
      const now = Math.floor(Date.now() / 1000);
      
      if (isLoading) {
        return <span>Loading...</span>;
      }
      
      if (now < row.original.endTimestamp) {
        return <i>Period in progress</i>;
      }
      
      return <span>{latestPrice}</span>;
    },
  },
  {
    id: 'wstETHRatio',
    header: 'wstETH Ratio',
    cell: ({ row }) => {
      const { stEthPerToken } = useFoil();
      return <span>{stEthPerToken}</span>;
    },
  },
  {
    id: 'adjustedPrice',
    header: 'Adjusted Price (wstETH/Ggas)',
    cell: ({ row }) => {
      const { priceAdjusted, isLoading } = useSettlementPrice(
        row.original.market,
        row.original
      );
      const now = Math.floor(Date.now() / 1000);
      
      if (isLoading) {
        return <span>Loading...</span>;
      }
      
      if (now < row.original.endTimestamp) {
        return <i>Period in progress</i>;
      }
      
      return <span>{priceAdjusted}</span>;
    },
  },
  {
    id: 'sqrtPriceX96',
    header: 'SqrtPriceX96',
    cell: ({ row }) => {
      const { sqrtPriceX96, isLoading } = useSettlementPrice(
        row.original.market,
        row.original
      );
      const now = Math.floor(Date.now() / 1000);
      
      if (isLoading) {
        return <span>Loading...</span>;
      }
      
      if (now < row.original.endTimestamp) {
        return <i>Period in progress</i>;
      }
      
      return <span>{sqrtPriceX96.toString()}</span>;
    },
  },
  // Split Bond into separate columns
  {
    id: 'bondCurrency',
    header: 'Bond Currency',
    cell: ({ row }) => {
      const bondCurrency = row.original.market.marketParams?.bondCurrency;
      if (!bondCurrency) return <span>Loading...</span>;
      
      return (
        <AddressCell address={bondCurrency} chainId={row.original.chainId} />
      );
    },
  },
  {
    id: 'bondAmount',
    header: 'Bond Required',
    cell: ({ row }) => {
      const bondAmount = row.original.market.marketParams?.bondAmount;
      if (!bondAmount) return <span>Loading...</span>;
      
      return <span>{bondAmount.toString()}</span>;
    },
  },
  {
    id: 'bondApproved',
    header: 'Bond Approved',
    cell: ({ row }) => {
      const { address } = useAccount();
      const market = row.original.market;
      const bondCurrency = market.marketParams?.bondCurrency;
      const bondAmount = market.marketParams?.bondAmount;
      
      // Determine the target address for approval
      // Use vault address if it exists, otherwise use market address
      const targetAddress = market.vaultAddress !== zeroAddress 
        ? market.vaultAddress 
        : market.address;
      
      const { data: allowance } = useReadContract({
        abi: erc20ABI,
        address: bondCurrency as `0x${string}`,
        functionName: 'allowance',
        args: [address, targetAddress],
        account: address || zeroAddress,
        chainId: row.original.chainId,
        query: {
          enabled: !!address && !!bondAmount && !!targetAddress && !!bondCurrency,
        },
      });
      
      return <span>{allowance?.toString() || '0'}</span>;
    },
  },
  {
    id: 'bondApprove',
    header: 'Bond Action',
    cell: ({ row }) => {
      const market = row.original.market;
      const bondAmount = market.marketParams?.bondAmount;
      const bondCurrency = market.marketParams?.bondCurrency;
      
      if (!bondAmount || !bondCurrency) {
        return <span>Loading...</span>;
      }
      
      return (
        <BondApproveButton 
          market={market}
          bondAmount={bondAmount}
          bondCurrency={bondCurrency}
          vaultAddress={market.vaultAddress} // Pass the actual vault address
        />
      );
    },
  },
  {
    id: 'settlement',
    header: 'Settle',
    cell: ({ row }) => (
      <SettleCell
        market={row.original.market}
        epoch={row.original}
        missingBlocks={missingBlocks}
      />
    ),
  },
];

export default getColumns;
