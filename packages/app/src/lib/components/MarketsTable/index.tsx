import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, ChevronDown } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
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

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error, refetchMarkets } = useMarketList();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  console.log('markets=', markets);

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
          <TableRow>
            <TableHead>Market Address</TableHead>
            <TableHead>Chain ID</TableHead>
            <TableHead>Is Public?</TableHead>
            <TableHead>Epochs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {markets.map((market) => (
            <TableRow key={market.id}>
              <TableCell>
                <MarketAddress address={market.address} />
              </TableCell>
              <TableCell>{market.chainId}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2 mt-3">
                  <p className="text-sm">{market.public ? 'yes' : 'no'}</p>
                  <Switch
                    checked={market.public}
                    onCheckedChange={() => updateMarketPrivacy(market)}
                    disabled={loadingAction[market.address]}
                  />
                </div>
                {loadingAction[market.address] && (
                  <Loader2 className="h-4 w-4 block mt-2 animate-spin" />
                )}
              </TableCell>
              <TableCell className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Epoch ID</TableHead>
                      <TableHead>Start Timestamp</TableHead>
                      <TableHead>End Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {market.epochs.map((epoch) => (
                      <EpochItem
                        key={epoch.epochId}
                        market={market}
                        epoch={epoch}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

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

  const requireApproval = !allowance || bondAmount > (allowance as bigint);

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
          <p>Settled</p>
          <p>{Number(settlementPrice)}</p>
        </div>
      );
    }

    if (isLatestPriceLoading) {
      return 'Loading Latest Price...';
    }

    return (
      <div className="space-y-2">
        <p>{formatAmount(priceAdjusted)}</p>
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

  return (
    <TableRow key={epoch.id}>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Get Missing Blocks
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={loadingAction.getMissing}
              onClick={() =>
                handleGetMissing(market, epoch.epochId, 'ResourcePrice')
              }
            >
              Resource Prices
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={loadingAction.getMissing}
              onClick={() => handleGetMissing(market, epoch.epochId, 'Event')}
            >
              Events
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell>{epoch.epochId}</TableCell>
      <TableCell>
        {new Date(epoch.startTimestamp * 1000).toLocaleString()}
      </TableCell>
      <TableCell>
        {new Date(epoch.endTimestamp * 1000).toLocaleString()}
      </TableCell>
      <TableCell>{renderSettledCell()}</TableCell>
    </TableRow>
  );
};

export default MarketsTable;
