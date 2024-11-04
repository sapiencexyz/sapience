'use client';

/* eslint-disable sonarjs/no-duplicate-string */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { useToast } from '~/hooks/use-toast';
import Chart from '~/lib/components/chart';
import ChartSelector from '~/lib/components/ChartSelector';
import DepthChart from '~/lib/components/DepthChart';
import EpochHeader from '~/lib/components/foil/epochHeader';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import MarketUnitsToggle from '~/lib/components/foil/marketUnitsToggle';
import Stats from '~/lib/components/foil/stats';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import VolumeChart from '~/lib/components/VolumeChart';
import VolumeWindowSelector from '~/lib/components/VolumeWindowButtons';
import { API_BASE_URL } from '~/lib/constants/constants';
import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { ChartType, TimeWindow } from '~/lib/interfaces/interfaces';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const useAccountData = () => {
  const { address, isConnected } = useAccount();

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

const Market = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(
    TimeWindow.W
  );
  const [tableFlexHeight, setTableFlexHeight] = useState(172);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>(
    isTrade ? ChartType.PRICE : ChartType.LIQUIDITY
  );
  const [isRefetchingIndexPrices, setIsRefetchingIndexPrices] = useState(false);
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;
  const { toast } = useToast();

  // useEffect to handle table resize
  useEffect(() => {
    const resizeElement = resizeRef.current;
    if (!resizeElement) return;
    let startY: number;
    let startHeight: number;

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(50, startHeight + deltaY);
      setTableFlexHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      startY = e.clientY;
      startHeight = tableFlexHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    if (resizeElement) {
      resizeElement.addEventListener('mousedown', onMouseDown);
    }

    return () => {
      if (resizeElement) {
        resizeElement.removeEventListener('mousedown', onMouseDown);
      }
    };
  }, [tableFlexHeight, resizeRef.current]);

  const useVolume = () => {
    return useQuery({
      queryKey: ['volume', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/volume?contractId=${contractId}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
    });
  };

  const {
    data: volume,
    error: useVolumeError,
    isLoading: isLoadingVolume,
    refetch: refetchVolume,
  } = useVolume();

  useEffect(() => {
    if (useVolumeError) {
      console.error('useVolumeError =', useVolumeError);
    }
  }, [volume, useVolumeError]);

  const useMarketPrices = () => {
    return useQuery({
      queryKey: ['market-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/chart-data?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const useIndexPrices = () => {
    return useQuery({
      queryKey: ['index-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/index?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const {
    data: marketPrices,
    error: usePricesError,
    isLoading: isLoadingPrices,
    refetch: refetchPrices,
    isRefetching: isRefetchingPrices,
  } = useMarketPrices();

  const {
    data: indexPrices,
    error: useIndexPricesError,
    isLoading: isLoadingIndexPrices,
    refetch: refetchIndexPrices,
  } = useIndexPrices();

  useEffect(() => {
    setIsRefetchingIndexPrices(true);
    refetchVolume();
    refetchPrices();
    refetchIndexPrices().then(() => {
      setIsRefetchingIndexPrices(false);
    });
  }, [selectedWindow]);

  const idxLoading = isLoadingIndexPrices || isRefetchingIndexPrices;

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <Chart
          activeWindow={selectedWindow}
          data={{
            marketPrices: marketPrices || [],
            indexPrices: indexPrices || [],
          }}
          isLoading={idxLoading}
        />
      );
    }
    if (chartType === ChartType.VOLUME) {
      return <VolumeChart data={volume || []} activeWindow={selectedWindow} />;
    }
    if (chartType === ChartType.LIQUIDITY) {
      return <DepthChart />;
    }
    return null;
  };

  const renderLoadng = () => {
    if (chartType === ChartType.PRICE && idxLoading) {
      return (
        <div
          className="flex ml-2 gap-2 justify-center items-center"
          id="idx-loading"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading Index Prices...</span>
        </div>
      );
    }
    return null;
  };

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
  }, [accountDataError, toast]);

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <AddEditPositionProvider>
        <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-hidden">
          <EpochHeader />
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col flex-1 overflow-hidden px-6 gap-8 md:flex-row">
              <div
                className="flex flex-col w-full h-full overflow-hidden"
                id="chart-stat-flex"
              >
                <Stats />

                <div className="flex flex-1 id-chart-flex min-h-0">
                  {renderChart()}
                </div>
                <div className="flex justify-between w-full items-center mt-1 mb-3 flex-shrink-0">
                  <div className="flex flex-row">
                    <MarketUnitsToggle />
                    {chartType !== ChartType.LIQUIDITY && (
                      <div className="flex flex-row">
                        <VolumeWindowSelector
                          selectedWindow={selectedWindow}
                          setSelectedWindow={setSelectedWindow}
                        />
                        {renderLoadng()}
                      </div>
                    )}
                  </div>
                  <ChartSelector
                    chartType={chartType}
                    setChartType={setChartType}
                  />
                </div>
              </div>
              <div className="w-full md:max-w-[360px] pb-3">
                <MarketSidebar isTrade={isTrade} />
              </div>
            </div>
            {transactions.length > 0 && (
              <div
                className="flex id-table-flex border-t border-border position-relative justify-center items-center relative"
                style={{ height: `${tableFlexHeight}px` }}
              >
                <div
                  ref={resizeRef}
                  className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-gray-30"
                />
                {isLoadingAccountData ? (
                  <div className="flex justify-center items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  </div>
                ) : (
                  <Tabs
                    defaultValue="transactions"
                    className="flex flex-col w-full h-full"
                  >
                    <TabsList>
                      <TabsTrigger value="transactions">
                        Your Transactions
                      </TabsTrigger>
                      <TabsTrigger value="trader-positions">
                        Your Trader Positions
                      </TabsTrigger>
                      <TabsTrigger value="lp-positions">
                        Your LP Positions
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex-grow overflow-y-auto">
                      <TabsContent value="transactions">
                        <TransactionTable transactions={transactions} />
                      </TabsContent>
                      <TabsContent value="trader-positions">
                        <TraderPositionsTable positions={traderPositions} />
                      </TabsContent>
                      <TabsContent value="lp-positions">
                        <LiquidityPositionsTable positions={lpPositions} />
                      </TabsContent>
                    </div>
                  </Tabs>
                )}
              </div>
            )}
          </div>
        </div>
      </AddEditPositionProvider>
    </MarketProvider>
  );
};

export default Market;
