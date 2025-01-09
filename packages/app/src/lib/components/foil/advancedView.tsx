'use client';

/* eslint-disable sonarjs/no-duplicate-string */

import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, useContext } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { formatUnits } from 'viem';
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
import { useResources } from '~/lib/hooks/useResources';
import { ChartType, TimeWindow } from '~/lib/interfaces/interfaces';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

const getTimeWindowSeconds = (window: TimeWindow): number => {
  switch (window) {
    case TimeWindow.H:
      return 60 * 60;
    case TimeWindow.D:
      return 24 * 60 * 60;
    case TimeWindow.W:
      return 7 * 24 * 60 * 60;
    case TimeWindow.M:
      return 30 * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
};

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const RESOURCE_PRICES_QUERY = gql`
  query GetResourcePrices($slug: String!, $startTime: Int, $endTime: Int) {
    resourcePrices(slug: $slug, startTime: $startTime, endTime: $endTime) {
      timestamp
      value
    }
  }
`;

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
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const { data: resources } = useResources();

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

  const useResourcePrices = () => {
    const resource = resources?.find((r) =>
      r.markets.some(
        (m) => m.chainId === Number(chainId) && m.address === marketAddress
      )
    );
    const epochData = resource?.markets
      .find((m) => m.chainId === Number(chainId) && m.address === marketAddress)
      ?.epochs.find((e) => e.epochId === Number(epoch));

    return useQuery<ResourcePricePoint[]>({
      queryKey: [
        'resourcePrices',
        resource?.slug,
        epochData?.startTimestamp,
        epochData?.endTimestamp,
      ],
      queryFn: async () => {
        if (!resource?.slug || !epochData) {
          return [];
        }
        const response = await fetch(
          `${API_BASE_URL}/resources/${resource.slug}/prices?startTime=${epochData.startTimestamp}&endTime=${epochData.endTimestamp}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch resource prices');
        }
        const data: ResourcePrice[] = await response.json();
        return data.map((price) => ({
          timestamp: Number(price.timestamp) * 1000,
          price: Number(formatUnits(BigInt(price.value), 9)),
        }));
      },
      refetchInterval: 2000,
      enabled: !!resource?.slug && !!epochData,
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

  const {
    data: resourcePrices,
    error: useResourcePricesError,
    isLoading: isLoadingResourcePrices,
    refetch: refetchResourcePrices,
  } = useResourcePrices();

  useEffect(() => {
    setIsRefetchingIndexPrices(true);
    refetchVolume();
    refetchPrices();
    refetchResourcePrices();
    refetchIndexPrices().then(() => {
      setIsRefetchingIndexPrices(false);
    });
  }, [selectedWindow]);

  const idxLoading =
    isLoadingIndexPrices || isRefetchingIndexPrices || isLoadingResourcePrices;

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <Chart
          activeWindow={selectedWindow}
          data={{
            marketPrices: marketPrices || [],
            indexPrices: indexPrices || [],
            resourcePrices: resourcePrices || [],
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

  useEffect(() => {
    if (useResourcePricesError) {
      toast({
        title: 'Error loading resource prices',
        description: useResourcePricesError.message,
        duration: 5000,
      });
    }
  }, [useResourcePricesError, toast]);

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <AddEditPositionProvider>
        <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden">
          <EpochHeader />
          <div className="flex flex-col flex-1 lg:overflow-y-auto md:overflow-visible">
            <div className="flex flex-col flex-1 px-4 md:px-6 gap-4 md:gap-8 md:flex-row min-h-0">
              <div className="w-full order-2 md:order-2 md:max-w-[360px] pb-3">
                <MarketSidebar isTrade={isTrade} />
              </div>
              <div className="flex flex-col w-full order-1 md:order-1">
                <Stats />

                <div className="flex flex-1 id-chart-flex min-h-[400px] md:min-h-0 overflow-visible lg:overflow-hidden">
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
            </div>
            {transactions.length > 0 && (
              <div
                className="flex id-table-flex border-t border-border position-relative justify-center items-center relative lg:h-[172px]"
                style={{
                  height: isLargeScreen ? `${tableFlexHeight}px` : 'auto',
                }}
              >
                <div
                  ref={resizeRef}
                  className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-gray-30 hidden lg:block"
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
                        <span className="hidden lg:inline">Your&nbsp;</span>
                        Transactions
                      </TabsTrigger>
                      <TabsTrigger value="trader-positions">
                        <span className="hidden lg:inline">Your&nbsp;</span>
                        Trader Positions
                      </TabsTrigger>
                      <TabsTrigger value="lp-positions">
                        <span className="hidden lg:inline">Your&nbsp;</span>
                        LP Positions
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex-grow overflow-y-auto">
                      <TabsContent value="transactions" className="mt-0">
                        <TransactionTable transactions={transactions} />
                      </TabsContent>
                      <TabsContent value="trader-positions" className="mt-0">
                        <TraderPositionsTable positions={traderPositions} />
                      </TabsContent>
                      <TabsContent value="lp-positions" className="mt-0">
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
