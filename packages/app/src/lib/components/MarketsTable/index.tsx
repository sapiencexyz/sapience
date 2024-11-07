/* eslint-disable react/no-unstable-nested-components */
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
import { ChevronDown, ChevronUp, ArrowUpDown, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState, useMemo } from 'react';
import type { AbiFunction } from 'viem';
import { parseUnits, zeroAddress } from 'viem';
import * as Chains from 'viem/chains';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import useFoilDeployment from '../foil/useFoilDeployment';
import MarketAddress from '../MarketAddress';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useToast } from '~/hooks/use-toast';
import {
  API_BASE_URL,
  DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useMarketList, type Market } from '~/lib/context/MarketListProvider';
import { formatAmount } from '~/lib/util/numberUtil';
import { gweiToEther } from '~/lib/util/util';

// Move component definitions outside of MarketsTable

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

const AddressCell: React.FC<{ address: string }> = ({ address }) => (
  <MarketAddress address={address} />
);

const PublicCell: React.FC<{
  isPublic: boolean;
  market: Market;
  loading: boolean;
  onUpdate: (market: Market) => void;
}> = ({ isPublic, market, loading, onUpdate }) => (
  <>
    <Switch
      checked={isPublic}
      onCheckedChange={() => onUpdate(market)}
      disabled={loading}
    />
    {loading && <Loader2 className="h-4 w-4 block mt-2 animate-spin" />}
  </>
);

const ActionsCell: React.FC<{
  market: Market;
  epochId: number;
  loading: boolean;
  onGetMissing: (m: Market, epochId: number, model: string) => void;
}> = ({ market, epochId, loading, onGetMissing }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">
        Get Missing Blocks
        <ChevronDown className="ml-2 h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem
        disabled={loading}
        onClick={() => onGetMissing(market, epochId, 'ResourcePrice')}
      >
        Resource Prices
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={loading}
        onClick={() => onGetMissing(market, epochId, 'Event')}
      >
        Events
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error, refetchMarkets } = useMarketList();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'startTimestamp', desc: true },
  ]);
  const { toast } = useToast();

  const data = useMemo(
    () =>
      markets.flatMap((market) =>
        market.epochs.map((epoch) => ({
          ...epoch,
          market,
          marketAddress: market.address,
          chainId: market.chainId,
          isPublic: market.public,
        }))
      ),
    [markets]
  );

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'marketAddress',
        header: 'Address',
        cell: ({ row }) => <AddressCell address={row.original.marketAddress} />,
      },
      {
        id: 'chainId',
        header: 'Chain',
        accessorKey: 'chainId',
      },
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
        id: 'epochId',
        header: 'Epoch',
        accessorKey: 'epochId',
      },
      {
        id: 'startTimestamp',
        header: 'Start',
        accessorKey: 'startTimestamp',
        cell: ({ getValue }) =>
          new Date((getValue() as number) * 1000).toLocaleString(),
      },
      {
        id: 'endTimestamp',
        header: 'End',
        accessorKey: 'endTimestamp',
        cell: ({ getValue }) =>
          new Date((getValue() as number) * 1000).toLocaleString(),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <ActionsCell
            market={row.original.market}
            epochId={row.original.epochId}
            loading={loadingAction.getMissing}
            onGetMissing={handleGetMissing}
          />
        ),
      },
      {
        id: 'settlement',
        header: 'Settlement',
        cell: ({ row }) => (
          <EpochItem market={row.original.market} epoch={row.original} />
        ),
      },
    ],
    [loadingAction]
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
    const response = await axios.post(`${API_BASE_URL}/updateMarketPrivacy`, {
      address: market.address,
      chainId: market.chainId,
    });
    if (response.data.success) {
      await refetchMarkets();
    }
    setLoadingAction((prev) => ({ ...prev, [market.address]: false }));
  };

  const handleGetMissing = async (
    m: Market,
    epochId: number,
    model: string
  ) => {
    setLoadingAction((prev) => ({
      ...prev,
      getMissing: true,
    }));
    try {
      const response = await axios.get(
        `${API_BASE_URL}/missing-blocks?chainId=${m.chainId}&address=${m.address}&epochId=${epochId}&model=${model}`
      );
      console.log('response', response);
      toast({
        title: 'Finished Getting Missing Blocks',
        description: `${response.data.missingBlockNumbers.length} missing blocks found. See console for more info`,
        duration: 9000,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'There was an issue getting missing blocks.',
        duration: 9000,
      });
    }
    setLoadingAction((prev) => ({
      ...prev,
      getMissing: false,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center">
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
                <TableCell key={cell.id}>
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
}> = ({ market, epoch }) => {
  const account = useAccount();
  const { address } = account;
  const [loadingStEthPerToken, setLoadingStEthPerToken] = useState(false);
  const [stEthPerToken, setStEthPerToken] = useState(0);
  const { toast } = useToast();
  const { foilData, loading, error } = useFoilDeployment(market?.chainId);
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

  const { data: epochData, refetch: refetchEpochData } = useReadContract({
    address: market.address as `0x${string}`,
    abi: foilData?.abi,
    functionName: 'getEpoch',
    args: [BigInt(epoch.epochId)],
    chainId: market.chainId,
    query: {
      enabled: !loading && !error && !!foilData,
    },
  }) as any;
  const epochSettled = epochData ? epochData[7] : undefined;
  const settlementPrice = epochData ? epochData[8] : undefined;
  const bondAmount =
    epochData && epochData[9] ? epochData[9].bondAmount : undefined;
  const bondCurrency =
    epochData && epochData[9] ? epochData[9].bondCurrency : undefined;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI as AbiFunction[],
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, market.address],
    account: address || zeroAddress,
    chainId: market.chainId,
    query: {
      enabled: !!address && !!bondAmount,
    },
  });

  const { writeContract: settleWithPrice, data: settlementHash } =
    useWriteContract({
      mutation: {
        onError: (settleError) => {
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
        resetAfterError();
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: (error as Error).message,
        });
      },
      onSuccess: async () => {
        await refetchAllowance();
      },
    },
  });

  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isApproveSuccess && txnStep === 1) {
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
    queryKey: ['latestPrice', `${market?.chainId}:${market?.address}`],
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

  const handleSettleWithPrice = () => {
    settleWithPrice({
      address: market.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'submitSettlementPrice',
      args: [
        epoch.epochId,
        parseUnits(priceAdjusted.toString(), TOKEN_DECIMALS),
      ],
    });
    setTxnStep(2);
  };
  const handleApproveSettle = async () => {
    setLoadingAction((prev) => ({ ...prev, settle: true }));
    approveWrite({
      abi: erc20ABI,
      address: bondCurrency as `0x${string}`,
      functionName: 'approve',
      args: [market.address, bondAmount],
      chainId,
    });
    setTxnStep(1);
  };

  const resetAfterError = () => {
    setTxnStep(0);
    setLoadingAction((prev) => ({ ...prev, settle: false }));
  };

  const renderSettledCell = () => {
    if (epochSettled) {
      return (
        <div className="space-y-1">
          <p className="text-lg">{Number(settlementPrice)}</p>
          <Button disabled>Settled</Button>
        </div>
      );
    }

    if (isLatestPriceLoading) {
      return 'Loading Latest Price...';
    }

    return (
      <div className="space-y-2">
        <p className="text-lg">{formatAmount(priceAdjusted)}</p>
        <Button
          disabled={!epochData}
          onClick={
            requireApproval ? handleApproveSettle : handleSettleWithPrice
          }
        >
          {requireApproval
            ? `Approve ${collateralTickerFunctionResult.data} Transfer`
            : 'Settle with Price'}
        </Button>
        {!epochData && (
          <p className="text-sm text-red-500 text-center">
            Could not get epoch data for market
          </p>
        )}
      </div>
    );
  };

  const requireApproval = !allowance || bondAmount > (allowance as bigint);

  return renderSettledCell();
};

export default MarketsTable;
