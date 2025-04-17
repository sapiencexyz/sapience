import { Button } from '@foil/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Download, Loader2, InfoIcon, Vault, Check } from 'lucide-react';
import Image from 'next/image';
import { zeroAddress } from 'viem';
import { base, sepolia } from 'viem/chains';
import { useReadContract } from 'wagmi';

import NumberDisplay from '~/components/numberDisplay';
import type { MarketGroup } from '~/lib/context/FoilProvider';
import erc20ABI from '~/lib/erc20abi.json';
import { useMarketPriceData } from '~/lib/hooks/useMarketPriceData';
import { useResources } from '~/lib/hooks/useResources';

import AddressCell from './AddressCell';
import PublicCell from './PublicCell';
import SettleCell from './SettleCell';
import type { MissingBlocks } from './types';

// Extend the Market type with missing properties
declare module '~/lib/context/FoilProvider' {
  interface MarketGroup {
    marketParams?: {
      bondCurrency: `0x${string}`;
      bondAmount: bigint;
    };
    collateral?: {
      symbol: string;
    };
    isYin: boolean;
    isCumulative: boolean;
  }
}

// Create a mapping of chain IDs to viem chain objects with added color property
interface ChainWithColor {
  id: number;
  name: string;
  color: string;
}

// Revert the chains mapping to its original state (without explorerUrl)
const chains: Record<number, ChainWithColor> = {
  [sepolia.id]: {
    id: sepolia.id,
    name: 'Sepolia',
    color: 'bg-gray-100 text-gray-800',
  },
  [base.id]: {
    id: base.id,
    name: 'Base',
    color: 'bg-blue-100 text-blue-800',
  },
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
  const foundResource = resources.find((resource) =>
    resource.marketGroups.some(
      (marketGroup) =>
        marketGroup.address === marketAddress && marketGroup.chainId === chainId
    )
  );

  if (!foundResource) {
    return <span>Unknown</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {foundResource.iconPath && (
        <Image
          src={foundResource.iconPath}
          alt={foundResource.name}
          width={20}
          height={20}
          className="object-contain"
        />
      )}
      <span>{foundResource.name}</span>
    </div>
  );
};

// Refactored VolumeCell to accept volume prop and useReadContract for symbol
const VolumeCell = ({
  volume,
  collateralAssetAddress,
  chainId,
}: {
  volume: number | null | undefined; // Volume is now passed as a prop
  collateralAssetAddress: string;
  chainId: number;
}) => {
  // Fetch collateral symbol
  const { data: collateralSymbol, isLoading: isLoadingSymbol } =
    useReadContract({
      abi: erc20ABI,
      address: collateralAssetAddress as `0x${string}`,
      functionName: 'symbol',
      chainId,
      query: {
        enabled: !!collateralAssetAddress && !!chainId, // Only run if address and chainId are present
        staleTime: Infinity, // Symbol is unlikely to change, cache indefinitely
      },
    });

  // Handle loading state based on props and symbol fetch
  if (volume === undefined || isLoadingSymbol) {
    return <span>Loading...</span>;
  }

  // Display volume and symbol once loaded
  const displaySymbol =
    collateralSymbol && typeof collateralSymbol === 'string'
      ? collateralSymbol
      : ''; // Fallback if symbol fetch fails or returns unexpected type

  // Show error if volume fetch failed
  if (volume === null) {
    // Use null to indicate fetch error from parent
    return <span className="text-red-500">Error</span>;
  }

  return (
    <span>
      <NumberDisplay value={volume} /> {displaySymbol}
    </span>
  );
};

// Define minimal ABI for owner() view function
const ownerAbi = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// BondApproveButton component to handle bond approval
const BondApproveButton = ({
  bondAmount,
  explorerLink,
}: {
  bondAmount: bigint | undefined;
  explorerLink: string;
}) => {
  const ButtonContent = (
    <Button
      size="icon"
      disabled={false}
      className="h-5 w-5 p-0 ml-1 bg-black text-white hover:bg-gray-800"
      asChild
    >
      <Check className="h-3 w-3" />
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <a href={explorerLink} target="_blank" rel="noopener noreferrer">
          <TooltipTrigger asChild>{ButtonContent}</TooltipTrigger>
        </a>
        <TooltipContent>
          <p>Approve {bondAmount?.toString() || 'N/A'} on Explorer</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Helper components for MarketPriceCell
const PriceDisplay = ({
  value,
  showTooltip,
  tooltipContent,
  renderAsString,
}: {
  value: any;
  showTooltip?: boolean;
  tooltipContent?: string;
  renderAsString?: boolean;
}) => {
  let content;
  if (value !== undefined) {
    if (renderAsString) {
      content = <span>{value}</span>;
    } else {
      content = <NumberDisplay value={value} />;
    }
  } else {
    content = <span>N/A</span>;
  }

  if (!showTooltip || !tooltipContent) return content;

  return (
    <div className="flex items-center gap-1">
      {content}
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
};

// Function to get the tooltip content based on price type and cumulative setting
const getTooltipContent = (type: string, isCumulative?: boolean): string => {
  if (type === 'indexPrice') {
    return isCumulative
      ? 'Estimated cumulative value for the period'
      : 'Estimated average price for the period';
  }

  if (type === 'adjustedPrice') {
    return isCumulative
      ? 'Estimated cumulative value adjusted for ratio'
      : 'Estimated average price adjusted for ratio';
  }

  if (type === 'sqrtPriceX96') {
    return 'Estimated SqrtPriceX96 for settlement';
  }

  return '';
};

// Simplified MarketPriceCell component
const MarketPriceCell = ({
  marketGroupAddress,
  chainId,
  marketId,
  endTimestamp,
  type,
  isCumulative,
}: {
  marketGroupAddress: string;
  chainId: number;
  marketId: number;
  endTimestamp: number;
  type: 'indexPrice' | 'stEthPerToken' | 'adjustedPrice' | 'sqrtPriceX96';
  isCumulative?: boolean;
}) => {
  const {
    indexPrice,
    stEthPerToken,
    adjustedPrice,
    sqrtPriceX96,
    isLoading,
    error,
    isActive,
    isEthereumResource,
  } = useMarketPriceData(marketGroupAddress, chainId, marketId, endTimestamp);

  if (isLoading) {
    return <span>Loading...</span>;
  }

  if (error) {
    return <span>Error: {error.message}</span>;
  }

  // Handle stEthPerToken specially (no tooltip needed, uses NumberDisplay)
  if (type === 'stEthPerToken') {
    return !isEthereumResource ? (
      <span>N/A</span>
    ) : (
      <PriceDisplay value={stEthPerToken} />
    );
  }

  // Get the appropriate value based on type
  let value;
  switch (type) {
    case 'indexPrice':
      value = indexPrice;
      break;
    case 'adjustedPrice':
      value = adjustedPrice;
      break;
    case 'sqrtPriceX96':
      // For sqrtPriceX96, we display it as a string
      value = sqrtPriceX96 ? sqrtPriceX96.toString() : undefined;
      break;
    default:
      value = undefined;
  }

  const tooltipContent = getTooltipContent(type, isCumulative);

  // Only show tooltip if the market is active
  return (
    <PriceDisplay
      value={value}
      showTooltip={isActive}
      tooltipContent={tooltipContent}
      renderAsString={type === 'sqrtPriceX96'}
    />
  );
};

// BondCell component with fixed comparison
const BondCell = ({
  marketGroup,
  chainId,
}: {
  marketGroup: MarketGroup;
  chainId: number;
}) => {
  const bondCurrency = marketGroup.marketParams?.bondCurrency;
  const bondAmount = marketGroup.marketParams?.bondAmount;
  const spenderAddress =
    marketGroup.vaultAddress !== zeroAddress
      ? marketGroup.vaultAddress
      : marketGroup.address;

  // Get the viem chain object based on chainId
  const getViemChain = (id: number) => {
    if (id === base.id) return base;
    if (id === sepolia.id) return sepolia;
    return undefined; // Handle unknown chains
  };
  const viemChain = getViemChain(chainId);
  const explorerUrl = viemChain?.blockExplorers?.default?.url;

  // 1. Fetch the owner of the spender contract
  const { data: ownerOfSpender, isLoading: isLoadingOwner } = useReadContract({
    abi: ownerAbi,
    address: spenderAddress as `0x${string}`,
    functionName: 'owner',
    chainId,
    query: {
      enabled: !!spenderAddress && spenderAddress !== zeroAddress,
    },
  });

  // 2. Fetch the allowance granted BY ownerOfSpender TO spenderAddress
  const { data: allowance, isLoading: isLoadingAllowance } = useReadContract({
    abi: erc20ABI,
    address: bondCurrency,
    functionName: 'allowance',
    args: [ownerOfSpender as `0x${string}`, spenderAddress as `0x${string}`],
    chainId,
    query: {
      enabled:
        !!ownerOfSpender && !!spenderAddress && !!bondAmount && !!bondCurrency,
    },
  });

  // Combined loading state
  if (
    isLoadingOwner ||
    isLoadingAllowance ||
    bondAmount === undefined ||
    !bondCurrency
  ) {
    if (!isLoadingOwner && !ownerOfSpender && spenderAddress !== zeroAddress) {
      return <span className="text-red-500">No owner found</span>;
    }
    return <span>Loading...</span>;
  }

  const currentAllowance = allowance ?? BigInt(0);

  // Compare as strings to avoid TypeScript type issues
  const currentAllowanceStr = currentAllowance.toString();
  const bondAmountStr = bondAmount?.toString() || '0';
  const requiresApproval =
    bondAmount !== undefined && currentAllowanceStr < bondAmountStr;

  // Construct the explorer link URL using viem chain data
  const blockExplorerLink =
    explorerUrl && bondCurrency
      ? `${explorerUrl}/address/${bondCurrency}#writeProxyContract`
      : undefined;

  return (
    <div className="flex items-center">
      <span className="mr-1">
        {currentAllowance.toString()} / {bondAmount?.toString() || '0'}
      </span>

      {/* Only show button if owner needs approval AND we have a valid explorer link */}
      {requiresApproval && blockExplorerLink && (
        <BondApproveButton
          bondAmount={bondAmount}
          explorerLink={blockExplorerLink}
        />
      )}
    </div>
  );
};

export interface TableRow {
  marketGroupAddress: string;
  chainId: number;
  marketId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
  assertionId?: string;
  vaultAddress: string;
  public: boolean;
  marketGroup: MarketGroup;
  question?: string;
  id?: number;
  volume?: number | null; // Add volume property
}

const getColumns = (
  loadingAction: { [key: string]: boolean },
  updateMarketPrivacy: (marketGroup: MarketGroup, marketId: number) => void,
  handleReindex: (
    reindexType: 'price' | 'events',
    marketGroupAddress: string,
    marketId: number,
    chainId: number
  ) => void,
  missingBlocks: MissingBlocks
): ColumnDef<TableRow>[] => [
  {
    id: 'isPublic',
    header: 'Public',
    accessorFn: (row) => (row.public ? 'true' : 'false'),
    cell: ({ row }) => (
      <PublicCell
        isPublic={row.original.public}
        loading={
          loadingAction[
            `${row.original.marketGroupAddress}-${row.original.marketId}`
          ]
        }
        marketGroup={row.original.marketGroup}
        marketId={row.original.marketId}
        onUpdate={updateMarketPrivacy}
      />
    ),
  },
  {
    id: 'question',
    header: 'Question',
    accessorKey: 'question',
    cell: ({ row }) => {
      const { question } = row.original;
      return question ? (
        <span>{question}</span>
      ) : (
        <span className="text-muted-foreground">N/A</span>
      );
    },
    enableColumnFilter: false,
    filterFn: 'includesString',
  },
  {
    id: 'volume',
    header: 'Volume',
    accessorFn: (row) => row.volume ?? null,
    enableSorting: true,
    cell: ({ row }) => (
      <VolumeCell
        volume={row.original.volume}
        chainId={row.original.chainId}
        collateralAssetAddress={row.original.marketGroup.collateralAsset}
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
    cell: ({ row }) => {
      const timestamp = row.original.endTimestamp;
      const date = new Date(timestamp * 1000);
      const now = new Date();

      // Calculate period duration in weeks
      const { startTimestamp } = row.original;
      const weeks = Math.round(
        (timestamp - startTimestamp) / (7 * 24 * 60 * 60)
      );

      return (
        <div className="flex items-center gap-2">
          <span>
            {date < now
              ? `${formatDistanceToNow(date)} ago`
              : `in ${formatDistanceToNow(date)}`}
          </span>
          <span className="text-xs text-gray-500">{weeks} week period</span>
        </div>
      );
    },
  },
  {
    id: 'resource',
    header: 'Resource',
    accessorFn: (row) => {
      // Use marketAddress for sorting but display resource cell
      return `${row.marketGroupAddress}-${row.chainId}`;
    },
    cell: ({ row }) => (
      <ResourceCell
        marketAddress={row.original.marketGroupAddress}
        chainId={row.original.chainId}
      />
    ),
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
      const actualVaultAddress = row.original.marketGroup.vaultAddress;
      const isVault = actualVaultAddress && actualVaultAddress !== zeroAddress;

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
        address={row.original.marketGroupAddress}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'marketId',
    header: 'Period',
    accessorKey: 'marketId',
    cell: ({ row }) => <span>{row.original.marketId}</span>,
  },
  {
    id: 'isCumulative',
    header: 'Cumulative',
    accessorFn: (row) => row.marketGroup?.isCumulative,
    cell: ({ row }) => (
      <span
        className={`text-lg ${row.original.marketGroup.isCumulative ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {row.original.marketGroup.isCumulative ? '●' : '○'}
      </span>
    ),
  },
  {
    id: 'isYin',
    header: 'Yin',
    accessorFn: (row) => row.marketGroup?.isYin,
    cell: ({ row }) => (
      <span
        className={`text-lg ${row.original.marketGroup.isYin ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {row.original.marketGroup.isYin ? '●' : '○'}
      </span>
    ),
  },
  {
    id: 'missingPriceBlocks',
    header: 'Missing Prices',
    accessorFn: (row) => {
      const key = `${row.marketGroupAddress}-${row.marketId}`;
      return missingBlocks[key]?.resourcePrice?.length || 0;
    },
    cell: ({ row }) => {
      const key = `${row.original.marketGroupAddress}-${row.original.marketId}`;
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
                    row.original.marketGroupAddress,
                    row.original.marketId,
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
  // Settlement Price column
  {
    id: 'settlementPriceGwei',
    header: 'Settlement Price',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketGroupAddress, chainId, marketId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketGroupAddress}-${chainId}-${marketId}-${endTimestamp}`;
    },
    cell: ({ row }) => (
      <MarketPriceCell
        marketGroupAddress={row.original.marketGroupAddress}
        chainId={row.original.chainId}
        marketId={row.original.marketId}
        endTimestamp={row.original.endTimestamp}
        type="indexPrice"
        isCumulative={row.original.marketGroup.isCumulative}
      />
    ),
  },
  // wstETH Ratio column
  {
    id: 'wstETHRatio',
    header: 'wstETH Ratio',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketGroupAddress, chainId, marketId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketGroupAddress}-${chainId}-${marketId}-${endTimestamp}`;
    },
    cell: ({ row }) => (
      <MarketPriceCell
        marketGroupAddress={row.original.marketGroupAddress}
        chainId={row.original.chainId}
        marketId={row.original.marketId}
        endTimestamp={row.original.endTimestamp}
        type="stEthPerToken"
      />
    ),
  },
  // Adjusted Price column
  {
    id: 'adjustedPrice',
    header: 'Adjusted Price',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketGroupAddress, chainId, marketId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketGroupAddress}-${chainId}-${marketId}-${endTimestamp}`;
    },
    cell: ({ row }) => (
      <MarketPriceCell
        marketGroupAddress={row.original.marketGroupAddress}
        chainId={row.original.chainId}
        marketId={row.original.marketId}
        endTimestamp={row.original.endTimestamp}
        type="adjustedPrice"
        isCumulative={row.original.marketGroup.isCumulative}
      />
    ),
  },
  // SqrtPriceX96 column
  {
    id: 'sqrtPriceX96',
    header: 'SqrtPriceX96',
    accessorFn: (row) => {
      // Use market data for sorting
      const { marketGroupAddress, chainId, marketId, endTimestamp } = row;
      // This is a placeholder for sorting - actual data will be fetched in the cell component
      return `${marketGroupAddress}-${chainId}-${marketId}-${endTimestamp}`;
    },
    cell: ({ row }) => (
      <MarketPriceCell
        marketGroupAddress={row.original.marketGroupAddress}
        chainId={row.original.chainId}
        marketId={row.original.marketId}
        endTimestamp={row.original.endTimestamp}
        type="sqrtPriceX96"
      />
    ),
  },
  {
    id: 'bondCurrency',
    header: 'Bond Currency',
    accessorFn: (row) => row.marketGroup?.marketParams?.bondCurrency || '',
    cell: ({ row }) => {
      const bondCurrency = row.original.marketGroup.marketParams?.bondCurrency;
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
      const bondAmount = row.marketGroup?.marketParams?.bondAmount;
      return bondAmount ? bondAmount.toString() : '';
    },
    cell: ({ row }) => (
      <BondCell
        marketGroup={row.original.marketGroup}
        chainId={row.original.chainId}
      />
    ),
  },
  {
    id: 'settlement',
    header: 'Settle',
    enableSorting: false,
    cell: ({ row }) => (
      <SettleCell
        marketGroup={row.original.marketGroup}
        market={{
          id: row.original.id ?? row.original.marketId, // Use id if available, fall back to epochId
          marketId: row.original.marketId,
          startTimestamp: row.original.startTimestamp,
          endTimestamp: row.original.endTimestamp,
          public: row.original.public,
        }}
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
            row.original.marketGroupAddress,
            row.original.marketId,
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
