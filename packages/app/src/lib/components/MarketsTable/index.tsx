/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable react/no-unstable-nested-components */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Loader2,
  Download,
  AlertCircle,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { AbiFunction } from 'viem';
import { parseUnits, zeroAddress } from 'viem';
import * as Chains from 'viem/chains';
import {
  useAccount,
  useReadContract,
  useSignMessage,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import useFoilDeployment from '../foil/useFoilDeployment';
import MarketAddress from '../MarketAddress';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import {
  ADMIN_AUTHENTICATE_MSG,
  API_BASE_URL,
  DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useMarketList, type Market } from '~/lib/context/MarketListProvider';
import type { EpochData, MarketParams } from '~/lib/interfaces/interfaces';
import { formatAmount } from '~/lib/util/numberUtil';
import { gweiToEther } from '~/lib/util/util';

// Update interface to only include resourcePrice
interface MissingBlocks {
  [key: string]: {
    resourcePrice?: number[];
  };
}

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

const AddressCell: React.FC<{ address: string; chainId: number }> = ({
  address,
  chainId,
}) => {
  const getExplorerUrl = (chainId: number, address: string) => {
    const chain = Object.values(Chains).find((c) => c.id === chainId);
    return chain?.blockExplorers?.default?.url
      ? `${chain.blockExplorers.default.url}/address/${address}`
      : `https://etherscan.io/address/${address}`;
  };

  return (
    <div className="flex space-x-2">
      <a
        href={getExplorerUrl(chainId, address)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {`${address.slice(0, 6)}...${address.slice(-4)}`}
      </a>
    </div>
  );
};

const PublicCell: React.FC<{
  isPublic: boolean;
  market: Market;
  loading: boolean;
  onUpdate: (market: Market) => void;
}> = ({ isPublic, market, loading, onUpdate }) => (
  <div className="flex items-center gap-2">
    <Switch
      checked={isPublic}
      onCheckedChange={() => onUpdate(market)}
      disabled={loading}
      aria-label="Toggle market public status"
    />
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
  </div>
);

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error, refetchMarkets } = useMarketList();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'endTimestamp', desc: true },
  ]);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const [missingBlocks, setMissingBlocks] = useState<MissingBlocks>({});

  const data = useMemo(() => {
    const flattenedData = markets.flatMap((market) =>
      market.epochs.map((epoch) => {
        console.log(
          'Processing epoch:',
          epoch.epochId,
          'for market:',
          market.address
        );
        return {
          ...epoch,
          market,
          marketAddress: market.address,
          chainId: market.chainId,
          isPublic: market.public,
        };
      })
    );
    console.log('Flattened market data:', flattenedData);
    return flattenedData;
  }, [markets]);

  // Simplify fetchMissingBlocks to only fetch resource price blocks
  const fetchMissingBlocks = async (market: Market, epochId: number) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/missing-blocks?chainId=${market.chainId}&address=${market.address}&epochId=${epochId}`
      );

      setMissingBlocks((prev) => ({
        ...prev,
        [`${market.address}-${epochId}`]: {
          resourcePrice: response.data.missingBlockNumbers,
        },
      }));
    } catch (error) {
      console.error('Error fetching missing blocks:', error);
    }
  };

  // Add useEffect to fetch missing blocks when markets load
  useEffect(() => {
    if (!isLoading && markets.length > 0) {
      markets.forEach((market) => {
        market.epochs.forEach((epoch) => {
          fetchMissingBlocks(market, epoch.epochId);
        });
      });
    }
  }, [markets, isLoading]);

  const handleReindex = async (
    reindexType: 'price' | 'events',
    marketAddress: string,
    epochId: number,
    chainId: number
  ) => {
    try {
      setLoadingAction((prev) => ({
        ...prev,
        [`reindex-${marketAddress}-${epochId}-${reindexType}`]: true,
      }));
      const timestamp = Date.now();

      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      const response = await axios.post(
        `${API_BASE_URL}/reindexMissingBlocks`,
        {
          chainId,
          address: marketAddress,
          epochId,
          model: reindexType === 'price' ? 'ResourcePrice' : 'Event',
          signature,
          timestamp,
        }
      );

      if (response.data.success) {
        toast({
          title: 'Reindexing started',
          description: response.data.message,
          variant: 'default',
        });
        // Find the market object and pass it to fetchMissingBlocks
        const market = markets.find((m) => m.address === marketAddress);
        if (market) {
          fetchMissingBlocks(market, epochId);
        }
      } else {
        toast({
          title: 'Reindexing failed',
          description: response.data.error,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.error('Error in handleReindex:', e);
      toast({
        title: 'Reindexing failed',
        description:
          e?.response?.data?.error || e.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoadingAction((prev) => ({
        ...prev,
        [`reindex-${marketAddress}-${epochId}-${reindexType}`]: false,
      }));
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'isPublic',
        header: 'Public',
        cell: ({ row }) => (
          <PublicCell
            isPublic={row.original.isPublic}
            market={row.original.market}
            loading={loadingAction[row.original.marketAddress]}
            onUpdate={updateMarketPrivacy}
          />
        ),
      },
      {
        id: 'marketAddress',
        header: 'Address',
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
        id: 'epochId',
        header: 'Epoch',
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
                    className="h-6 w-6 p-0"
                  >
                    <Download className="h-4 w-4" />
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
        id: 'missingPriceBlocks',
        header: 'Missing Price Blocks',
        cell: ({ row }) => {
          const key = `${row.original.marketAddress}-${row.original.epochId}`;
          const blocks = missingBlocks[key]?.resourcePrice;

          return (
            <div className="flex items-center gap-2">
              <span>
                {blocks ? blocks.length.toLocaleString() : 'Loading...'}
              </span>
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
                        className="h-6 w-6 p-0"
                      >
                        <Download className="h-4 w-4" />
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
      {
        id: 'settlementPrice',
        header: 'Settlement Price',
        cell: ({ row }) => (
          <SettlementPriceTableCell
            market={row.original.market}
            epoch={row.original}
          />
        ),
      },
      {
        id: 'settlement',
        header: 'Settle',
        cell: ({ row }) => (
          <EpochItem
            market={row.original.market}
            epoch={row.original}
            missingBlocks={missingBlocks}
          />
        ),
      },
    ],
    [missingBlocks, loadingAction]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  const updateMarketPrivacy = async (market: Market) => {
    setLoadingAction((prev) => ({ ...prev, [market.address]: true }));
    const timestamp = Date.now();

    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });
    const response = await axios.post(`${API_BASE_URL}/updateMarketPrivacy`, {
      address: market.address,
      chainId: market.chainId,
      signature,
      timestamp,
    });
    if (response.data.success) {
      await refetchMarkets();
    }
    setLoadingAction((prev) => ({ ...prev, [market.address]: false }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2">Loading Markets...</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer"
                >
                  <span className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <span className="ml-2 inline-block">
                      {renderSortIcon(header.column.getIsSorted())}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="text-lg">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

// Move EpochItem component definition here, outside of MarketsTable
const EpochItem: React.FC<{
  epoch: Market['epochs'][0];
  market: Market;
  missingBlocks: MissingBlocks;
}> = ({ market, epoch, missingBlocks }) => {
  const account = useAccount();
  const { address } = account;
  const [loadingStEthPerToken, setLoadingStEthPerToken] = useState(false);
  const [stEthPerToken, setStEthPerToken] = useState(0);
  const { toast } = useToast();
  const { foilData, loading, error, foilVaultData } = useFoilDeployment(
    market?.chainId
  );
  const { chainId, collateralAsset } = market;
  const { endTimestamp } = epoch;
  const [txnStep, setTxnStep] = useState(0);
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});

  const collateralTickerFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: market.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

  const currentTime = Math.floor(Date.now() / 1000);

  const stEthPerTokenResult = useReadContract({
    chainId: chainId === Chains.cannon.id ? Chains.sepolia.id : chainId,
    abi: [
      {
        inputs: [],
        name: 'stEthPerToken',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    address:
      chainId === Chains.cannon.id
        ? DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS
        : (collateralAsset as `0x${string}`),
    functionName: 'stEthPerToken',
  });

  useEffect(() => {
    if (stEthPerTokenResult.data) {
      setStEthPerToken(Number(gweiToEther(stEthPerTokenResult.data)));
    }
  }, [stEthPerTokenResult.data]);

  useEffect(() => {
    const updateSettledStEthPerToken = async () => {
      setLoadingStEthPerToken(true);
      console.log('repingging...');
      const response = await axios.get(
        `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${chainId}&collateralAssetAddress=${collateralAsset}&endTime=${endTimestamp}`
      );
      if (response.data.stEthPerToken) {
        setStEthPerToken(
          Number(gweiToEther(BigInt(response.data.stEthPerToken)))
        );
      }
      setLoadingStEthPerToken(false);
    };
    if (
      endTimestamp &&
      endTimestamp < currentTime &&
      chainId &&
      collateralAsset
    ) {
      updateSettledStEthPerToken();
    }
  }, [endTimestamp, chainId && collateralAsset]);

  const { data: getEpochData, refetch: refetchEpochData } = useReadContract({
    address: market.address as `0x${string}`,
    abi: foilData?.abi,
    functionName: 'getEpoch',
    args: [BigInt(epoch.epochId)],
    chainId: market.chainId,
    query: {
      enabled: !loading && !error && !!foilData,
    },
  }) as any;
  console.log('getEpochData', getEpochData);
  const epochData: EpochData | undefined = getEpochData
    ? getEpochData[0]
    : undefined;
  const marketParams: MarketParams | undefined = getEpochData
    ? getEpochData[1]
    : undefined;
  const epochSettled = epochData ? epochData.settled : undefined;
  const settlementPrice = epochData ? epochData.settlementPriceD18 : undefined;
  const bondAmount = marketParams ? marketParams.bondAmount : undefined;
  const bondCurrency = marketParams ? marketParams.bondCurrency : undefined;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI as AbiFunction[],
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, foilVaultData.address],
    account: address || zeroAddress,
    chainId: market.chainId,
    query: {
      enabled:
        !!address && !!bondAmount && !loading && !error && !!foilVaultData,
    },
  });

  const { writeContract: settleWithPrice, data: settlementHash } =
    useWriteContract({
      mutation: {
        onError: (settleError) => {
          console.error('Failed to settle: ', settleError);
          toast({
            variant: 'destructive',
            title: 'Failed to settle',
            description: (settleError as Error).message,
          });
          resetAfterError();
        },
        onSuccess: () => {
          toast({
            title: 'Transaction submitted',
            description: 'Waiting for confirmation...',
          });
        },
      },
    });

  const { isSuccess: isSettlementSuccess } = useWaitForTransactionReceipt({
    hash: settlementHash,
  });

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        console.error('Failed to approve: ', error);
        resetAfterError();
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: (error as Error).message,
        });
      },
    },
  });

  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isApproveSuccess && txnStep === 1) {
      refetchAllowance();
      handleSettleWithPrice();
    }
  }, [isApproveSuccess, txnStep]);

  // handle successful txn
  useEffect(() => {
    if (isSettlementSuccess && txnStep === 2) {
      toast({
        title: 'Successfully settled',
        description:
          'Note that it may take a few minutes while in the dispute period on UMA.',
      });
      refetchEpochData();
      setTxnStep(0);
      setLoadingAction((prev) => ({ ...prev, settle: false }));
    }
  }, [isSettlementSuccess]);

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: [
      'latestPrice',
      `${market?.chainId}:${market?.address}`,
      epoch.epochId,
    ],
    queryFn: async () => {
      console.log(
        'Fetching price for epoch:',
        epoch.epochId,
        'market:',
        market.address
      );
      const response = await fetch(
        `${API_BASE_URL}/prices/index/latest?contractId=${market.chainId}:${market.address}&epochId=${epoch.epochId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.price;
    },
    enabled: epoch.epochId !== 0 || market !== undefined,
  });
  const priceAdjusted = latestPrice / (stEthPerToken || 1);

  const handleSettleWithPrice = () => {
    const Q96 = BigInt('0x1000000000000000000000000');
    const sqrtPriceX96 = BigInt(
      Math.floor(Math.sqrt(priceAdjusted) * Number(Q96))
    );

    settleWithPrice({
      address: foilVaultData.address as `0x${string}`,
      abi: foilVaultData.abi,
      functionName: 'submitMarketSettlementPrice',
      args: [epoch.epochId, sqrtPriceX96],
    });
    setTxnStep(2);
  };

  const handleApproveSettle = async () => {
    setLoadingAction((prev) => ({ ...prev, settle: true }));
    approveWrite({
      abi: erc20ABI,
      address: bondCurrency as `0x${string}`,
      functionName: 'approve',
      args: [foilVaultData.address, bondAmount],
      chainId,
    });
    setTxnStep(1);
  };

  const resetAfterError = () => {
    setTxnStep(0);
    setLoadingAction((prev) => ({ ...prev, settle: false }));
  };

  const buttonIsLoading =
    loadingAction.settle ||
    loadingStEthPerToken ||
    stEthPerTokenResult.isLoading;

  const renderSettledCell = () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const isEpochEnded = epoch.endTimestamp && currentTime > epoch.endTimestamp;

    // Check for missing blocks
    const key = `${market.address}-${epoch.epochId}`;
    const missingBlocksCount =
      missingBlocks[key]?.resourcePrice?.length ?? null;
    const areMissingBlocksLoading = missingBlocksCount === null;
    const hasMissingBlocks = missingBlocksCount && missingBlocksCount > 0;

    const getButtonText = () => {
      if (!isEpochEnded) {
        return 'Epoch Active';
      }
      if (areMissingBlocksLoading) {
        return 'Loading Blocks...';
      }
      if (hasMissingBlocks) {
        return 'Missing Blocks';
      }
      if (requireApproval) {
        return `Approve ${collateralTickerFunctionResult.data} Transfer`;
      }
      return 'Settle with Price';
    };

    if (epochSettled) {
      return (
        <Button disabled size="sm">
          Settled
        </Button>
      );
    }

    if (isLatestPriceLoading) {
      return 'Loading Latest Price...';
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={
              !getEpochData ||
              buttonIsLoading ||
              !isEpochEnded ||
              areMissingBlocksLoading ||
              Boolean(hasMissingBlocks)
            }
            onClick={
              requireApproval ? handleApproveSettle : handleSettleWithPrice
            }
          >
            {buttonIsLoading && <Loader2 className="animate-spin" />}
            {getButtonText()}
          </Button>
          {!getEpochData && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Could not get epoch data for market</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  };

  const requireApproval =
    !allowance || (bondAmount && bondAmount > (allowance as bigint));

  return renderSettledCell();
};

// Add new SettlementPriceTableCell component
const SettlementPriceTableCell: React.FC<{
  market: Market;
  epoch: any;
}> = ({ market, epoch }) => {
  const [stEthPerToken, setStEthPerToken] = useState(0);

  const stEthPerTokenResult = useReadContract({
    chainId:
      market.chainId === Chains.cannon.id ? Chains.sepolia.id : market.chainId,
    abi: [
      {
        inputs: [],
        name: 'stEthPerToken',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    address:
      market.chainId === Chains.cannon.id
        ? DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS
        : (market.collateralAsset as `0x${string}`),
    functionName: 'stEthPerToken',
  });

  useEffect(() => {
    if (stEthPerTokenResult.data) {
      setStEthPerToken(Number(gweiToEther(stEthPerTokenResult.data)));
    }
  }, [stEthPerTokenResult.data]);

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: [
      'latestPrice',
      `${market?.chainId}:${market?.address}`,
      epoch.epochId,
    ],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/index/latest?contractId=${market.chainId}:${market.address}&epochId=${epoch.epochId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.price;
    },
    enabled: epoch.epochId !== 0 || market !== undefined,
  });

  const priceAdjusted = latestPrice / (stEthPerToken || 1);

  if (isLatestPriceLoading || stEthPerTokenResult.isLoading) {
    return <span>Loading...</span>;
  }

  return <span>{formatAmount(priceAdjusted)}</span>;
};

export default MarketsTable;
