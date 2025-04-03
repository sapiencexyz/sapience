import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Download, Loader2, InfoIcon, Vault, Check } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { zeroAddress } from 'viem';
import { base, sepolia } from 'viem/chains';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import NumberDisplay from '~/components/numberDisplay';
import { useToast } from '~/hooks/use-toast';
import type { Market } from '~/lib/context/FoilProvider';
import erc20ABI from '~/lib/erc20abi.json';
import { useMarketPriceData } from '~/lib/hooks/useMarketPriceData';
import { useResources } from '~/lib/hooks/useResources';

import AddressCell from './AddressCell';
import PublicCell from './PublicCell';
import SettleCell from './SettleCell';
import type { MissingBlocks, BondCellProps } from './types';

// Create a mapping of chain IDs to viem chain objects with added color property
interface ChainWithColor {
  id: number;
  name: string;
  color: string;
}

const chains: Record<number, ChainWithColor> = {
  [sepolia.id]: {
    id: sepolia.id,
    name: 'Sepolia',
    color: 'bg-gray-100 text-gray-800',
  },
  [base.id]: { id: base.id, name: 'Base', color: 'bg-blue-100 text-blue-800' },
};

// ResourceCell component to display resource name and icon
const ResourceCell = ({
  marketAddress,
  chainId,
}: {
  marketAddress: string;
  chainId: number;
}) => {
  const { data: resources } = useResources();

  if (!resources) {
    return <span>Loading...</span>;
  }

  // Find the resource that contains this market
  const resource = resources.find((resource) =>
    resource.markets.some(
      (market) => market.address === marketAddress && market.chainId === chainId
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
  vaultAddress,
}: Omit<BondCellProps, 'epoch'>) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);

  // Determine the target address for approval
  // Use vault address if it exists, otherwise use market address
  const targetAddress =
    market.vaultAddress !== zeroAddress ? market.vaultAddress : market.address;

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
    // Return null as the button is only shown when approval is needed
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={handleApprove}
            disabled={isApproving}
            className="h-5 w-5 p-0 ml-1 bg-black text-white hover:bg-gray-800"
          >
            {isApproving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Approve {bondAmount?.toString() || 'N/A'} bond</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
    accessorFn: (row) => (row.public ? 'true' : 'false'),
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
    id: 'question',
    header: 'Question',
    accessorFn: (row) => row.question || 'Coming soon...',
    cell: () => <span className="text-gray-500 italic">Coming soon...</span>,
  },
  {
    id: 'resource',
    header: 'Resource',
    accessorFn: (row) => {
      // Use marketAddress for sorting but display resource cell
      return `${row.marketAddress}-${row.chainId}`;
    },
    cell: ({ row }) => (
      <ResourceCell
        marketAddress={row.original.marketAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = row.startTimestamp;
      const endTime = row.endTimestamp;
      const { settled } = row;

      if (now < startTime) return '1'; // Pre-Period Trading
      if (now < endTime) return '2'; // Active Trading
      if (!settled) return row.assertionId ? '3' : '4'; // Submitted to UMA or Needs Settlement
      return '5'; // Settled
    },
    cell: ({ row }) => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = row.original.startTimestamp;
      const endTime = row.original.endTimestamp;
      const { settled } = row.original;
      const { assertionId } = row.original;

      let status = '';
      let statusClass = '';

      if (now < startTime) {
        status = 'Pre-Period Trading';
        statusClass = 'bg-blue-100 text-blue-800';
      } else if (now < endTime) {
        status = 'Active Trading';
        statusClass = 'bg-green-100 text-green-800';
      } else if (!settled) {
        if (assertionId) {
          status = 'Submitted to UMA';
          statusClass = 'bg-purple-100 text-purple-800';
        } else {
          status = 'Needs Settlement';
          statusClass = 'bg-orange-100 text-orange-800';
        }
      } else {
        status = 'Settled';
        statusClass = 'bg-gray-100 text-gray-800';
      }

      return (
        <div
          className={`px-2 py-1 rounded-md text-xs font-medium inline-block ${statusClass}`}
        >
          {status}
        </div>
      );
    },
  },
  {
    id: 'endTimestamp',
    header: 'Ends',
    accessorKey: 'endTimestamp',
    cell: ({ getValue }) => {
      const timestamp = getValue() as number;
      const date = new Date(timestamp * 1000);
      const now = new Date();
      return (
        <div className="flex items-center gap-2">
          <span>
            {date < now
              ? `${formatDistanceToNow(date)} ago`
              : `in ${formatDistanceToNow(date)}`}
          </span>
          <span className="text-xs text-gray-500">4 week period</span>
        </div>
      );
    },
  },
  {
    id: 'chainId',
    header: 'Chain',
    accessorKey: 'chainId',
    cell: ({ row }) => {
      const { chainId } = row.original;
      const chain = chains[chainId];

      if (chain) {
        return (
          <div
            className={`px-2 py-1 rounded-md text-xs font-medium inline-block ${chain.color}`}
          >
            {chain.name}
          </div>
        );
      }

      // Fallback for unknown chains
      return (
        <div className="px-2 py-1 rounded-md text-xs font-medium inline-block bg-gray-100 text-gray-800">
          Chain {chainId}
        </div>
      );
    },
  },
  {
    id: 'vaultAddress',
    header: 'Market Owner',
    accessorKey: 'vaultAddress',
    cell: ({ row }) => {
      // Get the actual vaultAddress from the market to compare
      const actualVaultAddress = row.original.market.vaultAddress;
      const isVault = actualVaultAddress !== zeroAddress;

      return (
        <div className="flex items-center gap-2">
          {isVault && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Vault className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Vault Contract</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <AddressCell
            address={row.original.vaultAddress}
            chainId={row.original.chainId}
          />
        </div>
      );
    },
  },
  {
    id: 'marketAddress',
    header: 'Market Address',
    accessorKey: 'marketAddress',
    cell: ({ row }) => (
      <AddressCell
        address={row.original.marketAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'epochId',
    header: 'Period',
    accessorKey: 'epochId',
    cell: ({ row }) => <span>{row.original.epochId}</span>,
  },
  {
    id: 'isCumulative',
    header: 'Cumulative',
    accessorFn: (row) => row.market?.isCumulative,
    cell: ({ row }) => (
      <span
        className={`text-lg ${row.original.market.isCumulative ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {row.original.market.isCumulative ? '●' : '○'}
      </span>
    ),
  },
  {
    id: 'isYin',
    header: 'Yin',
    accessorFn: (row) => row.market?.isYin,
    cell: ({ row }) => (
      <span
        className={`text-lg ${row.original.market.isYin ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {row.original.market.isYin ? '●' : '○'}
      </span>
    ),
  },
  {
    id: 'missingPriceBlocks',
    header: 'Missing Prices',
    accessorFn: (row) => {
      const key = `${row.marketAddress}-${row.epochId}`;
      return missingBlocks[key]?.resourcePrice?.length || 0;
    },
    cell: ({ row }) => {
      const key = `${row.original.marketAddress}-${row.original.epochId}`;
      const missingBlocksEntry = missingBlocks[key];
      const blocks = missingBlocksEntry?.resourcePrice;

      // Create reindex button component to reuse
      const reloadButton = (
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
              <p>Load Missing Prices</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      // If entry doesn't exist yet, show loading spinner without button
      if (missingBlocksEntry === undefined) {
        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          </div>
        );
      }

      // If blocks is undefined, that's an error state - show button to retry
      if (blocks === undefined) {
        return (
          <div className="flex items-center gap-2">
            <span className="text-amber-500">Error</span>
            {reloadButton}
          </div>
        );
      }

      // Only show reindex button if there are missing blocks
      return (
        <div className="flex items-center gap-2">
          <span>{blocks.length.toLocaleString()}</span>
          {blocks.length > 0 && reloadButton}
        </div>
      );
    },
  },
  // Split Settlement Price into separate columns
  {
    id: 'settlementPriceGwei',
    header: 'Settlement Price',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketAddress, chainId, epochId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketAddress}-${chainId}-${epochId}-${endTimestamp}`;
    },
    cell: ({ row }) => {
      const { isCumulative } = row.original.market;

      const { indexPrice, isLoading, error, isActive } = useMarketPriceData(
        row.original.marketAddress,
        row.original.chainId,
        row.original.epochId,
        row.original.endTimestamp
      );

      if (isLoading) {
        return <span>Loading...</span>;
      }

      if (error) {
        return <span>Error: {error.message}</span>;
      }

      const tooltipContent = isCumulative
        ? 'Estimated cumulative value for the period'
        : 'Estimated average price for the period';

      if (isActive) {
        return (
          <div className="flex items-center gap-1">
            {indexPrice !== undefined ? (
              <NumberDisplay value={indexPrice} />
            ) : (
              <span>N/A</span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltipContent}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      }

      return indexPrice !== undefined ? (
        <NumberDisplay value={indexPrice} />
      ) : (
        <span>N/A</span>
      );
    },
  },
  {
    id: 'wstETHRatio',
    header: 'wstETH Ratio',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketAddress, chainId, epochId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketAddress}-${chainId}-${epochId}-${endTimestamp}`;
    },
    cell: ({ row }) => {
      const { stEthPerToken, isLoading, isEthereumResource } =
        useMarketPriceData(
          row.original.marketAddress,
          row.original.chainId,
          row.original.epochId,
          row.original.endTimestamp
        );

      if (isLoading) {
        return <span>Loading...</span>;
      }

      // Only show stEthPerToken for Ethereum resources
      if (!isEthereumResource) {
        return <span>N/A</span>;
      }

      return <NumberDisplay value={stEthPerToken} />;
    },
  },
  {
    id: 'adjustedPrice',
    header: 'Adjusted Price',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketAddress, chainId, epochId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketAddress}-${chainId}-${epochId}-${endTimestamp}`;
    },
    cell: ({ row }) => {
      const { isCumulative } = row.original.market;

      const { adjustedPrice, isLoading, error, isActive } = useMarketPriceData(
        row.original.marketAddress,
        row.original.chainId,
        row.original.epochId,
        row.original.endTimestamp
      );

      if (isLoading) {
        return <span>Loading...</span>;
      }

      if (error) {
        return <span>Error: {error.message}</span>;
      }

      const tooltipContent = isCumulative
        ? 'Estimated cumulative value adjusted for ratio'
        : 'Estimated average price adjusted for ratio';

      if (isActive) {
        return (
          <div className="flex items-center gap-1">
            {adjustedPrice !== undefined ? (
              <NumberDisplay value={adjustedPrice} />
            ) : (
              <span>N/A</span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltipContent}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      }

      return adjustedPrice !== undefined ? (
        <NumberDisplay value={adjustedPrice} />
      ) : (
        <span>N/A</span>
      );
    },
  },
  {
    id: 'sqrtPriceX96',
    header: 'SqrtPriceX96',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketAddress, chainId, epochId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketAddress}-${chainId}-${epochId}-${endTimestamp}`;
    },
    cell: ({ row }) => {
      const { sqrtPriceX96, isLoading, error, isActive } = useMarketPriceData(
        row.original.marketAddress,
        row.original.chainId,
        row.original.epochId,
        row.original.endTimestamp
      );

      if (isLoading) {
        return <span>Loading...</span>;
      }

      if (error) {
        return <span>Error: {error.message}</span>;
      }

      if (isActive) {
        return (
          <div className="flex items-center gap-1">
            <span>{sqrtPriceX96 ? sqrtPriceX96.toString() : 'N/A'}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Estimated SqrtPriceX96 for settlement</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      }

      return <span>{sqrtPriceX96 ? sqrtPriceX96.toString() : 'N/A'}</span>;
    },
  },
  {
    id: 'bondCurrency',
    header: 'Bond Currency',
    accessorFn: (row) => row.market?.marketParams?.bondCurrency || '',
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
    accessorFn: (row) => {
      const bondAmount = row.market?.marketParams?.bondAmount;
      return bondAmount ? bondAmount.toString() : '';
    },
    cell: ({ row }) => {
      const { address } = useAccount();
      const { market } = row.original;
      const bondCurrency = market.marketParams?.bondCurrency;
      const bondAmount = market.marketParams?.bondAmount;

      // Determine the target address for approval
      const targetAddress =
        market.vaultAddress !== zeroAddress
          ? market.vaultAddress
          : market.address;

      const { data: allowance, isLoading: isLoadingAllowance } = useReadContract({
        abi: erc20ABI,
        address: bondCurrency as `0x${string}`,
        functionName: 'allowance',
        args: [address, targetAddress],
        account: address || zeroAddress,
        chainId: row.original.chainId,
        query: {
          enabled:
            !!address && !!bondAmount && !!targetAddress && !!bondCurrency,
        },
      });

      if (isLoadingAllowance || bondAmount === undefined) {
        return <span>Loading...</span>;
      }

      const requiresApproval = !allowance || bondAmount > (allowance as bigint);

      return (
        <div className="flex items-center">
          <span>
            {allowance ? (allowance as bigint).toString() : '0'} /{' '}
            {bondAmount.toString()}
          </span>
          {requiresApproval && (
            <BondApproveButton
              market={market}
              bondAmount={bondAmount}
              bondCurrency={bondCurrency}
              vaultAddress={market.vaultAddress} // Pass vaultAddress explicitly
            />
          )}
        </div>
      );
    },
  },
  {
    id: 'settlement',
    header: 'Settle',
    enableSorting: false,
    cell: ({ row }) => (
      <SettleCell
        market={row.original.market}
        epoch={row.original}
        missingBlocks={missingBlocks}
      />
    ),
  },
  {
    id: 'reindexEvents',
    header: 'Reindex',
    enableSorting: false,
    cell: ({ row }) => (
      <Button
        size="xs"
        onClick={() =>
          handleReindex(
            'events',
            row.original.marketAddress,
            row.original.epochId,
            row.original.chainId
          )
        }
      >
        Reindex Market Events
      </Button>
    ),
  },
];

export default getColumns;
