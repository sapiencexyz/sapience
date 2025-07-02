'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import Slider from '@sapience/ui/components/ui/slider';
import type { MarketGroupType, MarketType } from '@sapience/ui/types';
import { ChevronRight, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

import { useSapience } from '../../../lib/context/SapienceProvider';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PositionBadge from '~/components/shared/PositionBadge';
import PredictionDisplay from '~/components/shared/PredictionDisplay';
import PositionValueDisplay from '~/components/shared/PositionValueDisplay';
import MarketGroupChart from '~/components/forecasting/MarketGroupChart';
import MarketGroupHeader from '~/components/forecasting/MarketGroupHeader';
import MarketStatusDisplay from '~/components/forecasting/MarketStatusDisplay';
import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import {
  MarketGroupPageProvider,
  useMarketGroupPage,
} from '~/lib/context/MarketGroupPageProvider';
import type { MarketGroupClassification } from '~/lib/types';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';
import { formatRelativeTime } from '~/lib/utils/timeUtils';

export type ActiveTab = 'predict' | 'wager';

// Mock comment data with positions
const mockComments = [
  {
    id: 1,
    address: '0x742d35Cc6Ab4b8c0e5d5b7a1aebd2C7B4e37Ca2D',
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    comment: 'This market looks really promising. I think the price will continue to trend upward based on recent economic indicators.',
    prediction: { value: '1.50', side: 'yes' as const },
    positions: [
      {
        id: 'pos1',
        positionId: 123,
        baseToken: '1500000000000000000',
        borrowedBaseToken: '0',
        collateral: '1000000000000000000',
        owner: '0x742d35Cc6Ab4b8c0e5d5b7a1aebd2C7B4e37Ca2D',
        isLP: false,
        market: {
          marketId: 1,
          question: 'Will BTC reach $100k by end of 2024?',
          marketGroup: {
            baseTokenName: 'BTC',
            collateralSymbol: 'USDC',
            chainId: 1,
            address: '0x123',
          },
        },
      },
    ],
  },
  {
    id: 2,
    address: '0x8ba1f109551bD432803012645Hac136c22C5FfFF',
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    comment: 'Not sure about this one. The volatility has been crazy lately and I think we might see a correction soon.',
    prediction: { value: '0.75', side: 'no' as const },
    positions: [
      {
        id: 'pos2',
        positionId: 124,
        baseToken: '0',
        borrowedBaseToken: '800000000000000000',
        collateral: '500000000000000000',
        owner: '0x8ba1f109551bD432803012645Hac136c22C5FfFF',
        isLP: false,
        market: {
          marketId: 1,
          question: 'Will BTC reach $100k by end of 2024?',
          marketGroup: {
            baseTokenName: 'BTC',
            collateralSymbol: 'USDC',
            chainId: 1,
            address: '0x123',
          },
        },
      },
    ],
  },
  {
    id: 3,
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    timestamp: Date.now() - 1000 * 60 * 60 * 6, // 6 hours ago
    comment: 'Just placed a large wager on YES. The fundamentals look strong and I expect this to resolve positively.',
    prediction: { value: '2.25', side: 'yes' as const },
    positions: [
      {
        id: 'pos3',
        positionId: 125,
        baseToken: '2000000000000000000',
        borrowedBaseToken: '0',
        collateral: '1500000000000000000',
        owner: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        isLP: false,
        market: {
          marketId: 1,
          question: 'Will BTC reach $100k by end of 2024?',
          marketGroup: {
            baseTokenName: 'BTC',
            collateralSymbol: 'USDC',
            chainId: 1,
            address: '0x123',
          },
        },
      },
    ],
  },
];

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

const DynamicPredictForm = dynamic(
  () =>
    import('~/components/forecasting/forms/PredictForm').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center py-24 w-full">
        <LottieLoader width={32} height={32} />
      </div>
    ),
  }
);

const DynamicWagerFormFactory = dynamic(
  () =>
    import('~/components/forecasting/forms/WagerFormFactory').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-8">
        <LottieLoader width={30} height={30} />
      </div>
    ),
  }
);

// Create a ForecastingForm component to handle the form rendering logic
const ForecastingForm = ({
  marketGroupData,
  marketClassification,
  permitData,
  onWagerSuccess,
  activeMarket,
}: {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  permitData: { permitted: boolean };
  onWagerSuccess: (txnHash: string) => void;
  activeMarket?: MarketType;
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('wager');

  // Check if market is active (not expired or settled)
  const isActive = useMemo(() => {
    if (!activeMarket) {
      return false;
    }

    const isExpired =
      activeMarket.endTimestamp &&
      Date.now() > Number(activeMarket.endTimestamp) * 1000;

    return !isExpired;
  }, [activeMarket]);

  if (!isActive) {
    return (
      <MarketStatusDisplay
        marketGroupData={marketGroupData}
        marketClassification={marketClassification}
      />
    );
  }

  return (
    <div className="bg-card p-6 rounded shadow-sm border">
      <h2 className="text-3xl font-normal mb-4">Forecast</h2>
      {/* Tabs Section */}
      <div className="space-y-2 mt-4">
        <div className="flex w-full border-b">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'wager'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => setActiveTab('wager')}
          >
            Wager
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'predict'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => setActiveTab('predict')}
          >
            Predict
          </button>
        </div>

        {/* Form Content Based on Market Type */}
        <div className="pt-4">
          {/* Only render the active form component */}
          {activeTab === 'predict' ? (
            <DynamicPredictForm
              marketGroupData={marketGroupData}
              marketClassification={marketClassification}
              chainId={marketGroupData.chainId}
            />
          ) : (
            <DynamicWagerFormFactory
              marketClassification={marketClassification}
              marketGroupData={marketGroupData}
              isPermitted={!!permitData?.permitted}
              onSuccess={onWagerSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const MarketGroupPageContent = () => {
  const { address } = useAccount();
  const params = useParams();
  const pathname = usePathname();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [minSize, setMinSize] = useState([0]);
  const [addressFilter, setAddressFilter] = useState('');

  // Local trigger that will be bumped whenever the user submits a new wager
  const [userPositionsTrigger, setUserPositionsTrigger] = useState(0);

  const handleUserPositionsRefetch = useCallback(() => {
    setUserPositionsTrigger((prev) => prev + 1);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refetchUserPositions = useCallback(() => {}, [userPositionsTrigger]);

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  const {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    marketClassification,
    chainId,
  } = useMarketGroupPage();

  const { isLoading: isUserPositionsLoading } = usePositions({
    address: address || '',
    marketAddress,
  });

  // If loading, show the Lottie loader
  if (isLoading || isPermitLoadingPermit) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center">
        <LottieLoader />
      </div>
    );
  }

  // If error or no data, show error screen
  if (!isSuccess || !marketGroupData) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center p-4">
        <h2 className="text-2xl font-medium mb-4">
          Unable to load market data
        </h2>
        <p className="text-muted-foreground">
          Please try again later or check your connection.
        </p>
      </div>
    );
  }

  const optionNames = marketGroupData.markets.map(
    (market) => market.optionName || ''
  );

  // Find the active market once
  const activeMarket =
    activeMarkets.find((market) => market.poolAddress === marketAddress) ||
    activeMarkets[0];

  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-28 pb-40 lg:pt-32 lg:pb-12">
      <div className="container mx-auto max-w-4xl flex flex-col">
        <MarketGroupHeader
          marketGroupData={marketGroupData}
          activeMarket={activeMarket}
          chainId={chainId}
          marketClassification={marketClassification}
          chainShortName={chainShortName}
        />

        {/* Main content layout: Apply gap-6 and px-3 from user example */}
        <div className="flex flex-col gap-6 px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left Column (Chart/List) */}
            <div className="flex flex-col w-full md:flex-1">
              <div className="border border-border rounded flex flex-col flex-1 shadow-sm">
                <div className="flex-1 min-h-[400px]">
                  <MarketGroupChart
                    chainShortName={chainShortName as string}
                    marketAddress={marketAddress}
                    marketIds={activeMarkets.map((market) =>
                      Number(market.marketId)
                    )}
                    market={marketGroupData}
                    minTimestamp={
                      activeMarkets.length > 0
                        ? Math.min(
                            ...activeMarkets.map((market) =>
                              Number(market.startTimestamp)
                            )
                          )
                        : undefined
                    }
                    optionNames={optionNames}
                  />
                </div>
              </div>
            </div>

            {/* Form (Right Column) */}
            <div className="w-full lg:w-[340px]">
              <ForecastingForm
                marketGroupData={marketGroupData!}
                marketClassification={marketClassification!}
                permitData={permitData!}
                onWagerSuccess={handleUserPositionsRefetch}
                activeMarket={activeMarket}
              />
            </div>
          </div>

          {/* Row 2: Dropdown and Advanced View */}
          <div className="flex justify-between items-center">
            <div>{/* placeholder */}</div>
            {/* Advanced View button (Right Aligned) */}
            <div>
              <Link
                href={`${pathname}/${activeMarkets[0]?.marketId}`}
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold"
              >
                ADVANCED VIEW
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Row 3: User Positions Table */}
          {(() => {
            if (!address) {
              return null;
            }
            if (isUserPositionsLoading) {
              return (
                <div className="mt-6 text-center p-6 border border-muted rounded bg-background/50">
                  <div className="flex flex-col items-center justify-center py-2">
                    <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Loading your positions...
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div>
                <UserPositionsTable
                  account={address}
                  marketAddress={marketAddress}
                  chainId={chainId}
                  refetchUserPositions={refetchUserPositions}
                />
              </div>
            );
          })()}

          {/* Row 4: Comments Section */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-medium">Forecasts</h3>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1">
                  <Label htmlFor="min-size" className="text-sm whitespace-nowrap text-muted-foreground font-light">
                    Min Size:
                  </Label>
                  <span className="text-sm text-muted-foreground min-w-[2rem]">
                    {minSize[0]}
                  </span>
                  <div className="w-32">
                    <Slider
                      id="min-size"
                      min={0}
                      max={100}
                      step={1}
                      value={minSize}
                      onValueChange={setMinSize}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Filter by address..."
                    value={addressFilter}
                    onChange={(e) => setAddressFilter(e.target.value)}
                    className="pl-10 w-48 bg-transparent border-input"
                  />
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded shadow-sm">
              <div className="divide-y divide-border">
              {mockComments.map((comment) => (
                <div key={comment.id} className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <PredictionDisplay 
                        prediction={comment.prediction.side} 
                      />
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(comment.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 ml-8">
                      <PositionValueDisplay 
                        value={comment.prediction.value}
                        prediction={comment.prediction.side}
                      />
                      <AddressDisplay address={comment.address} />
                    </div>
                  </div>
                  <p className="text-lg leading-relaxed">{comment.comment}</p>
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Market Selection Dialog */}
      <Dialog open={showMarketSelector} onOpenChange={setShowMarketSelector}>
        <DialogContent className="sm:max-w-xl [&>[aria-label='Close']]:hidden p-8">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-3xl font-normal">
              Prediction Markets
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 pb-2">
            {activeMarkets.map((market: MarketType) => (
              <Link
                key={market.id}
                href={`${pathname}/${market.marketId}`}
                onClick={() => setShowMarketSelector(false)}
                className="block w-full p-4 bg-secondary hover:bg-secondary/80 rounded text-secondary-foreground transition-colors duration-300 text-left text-lg font-medium"
              >
                {market.question
                  ? formatQuestion(market.question)
                  : `Market ${market.marketId}`}
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MarketGroupPage = () => {
  const params = useParams();
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  return (
    <MarketGroupPageProvider pageDetails={{ chainShortName, marketAddress }}>
      <MarketGroupPageContent />
    </MarketGroupPageProvider>
  );
};

export default MarketGroupPage;
