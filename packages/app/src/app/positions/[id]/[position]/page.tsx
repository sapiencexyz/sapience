'use client';

import { badgeVariants } from '@foil/ui/components/ui/badge';
import { cn } from '@foil/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';

import MarketTiming from '~/components/MarketTiming';
import NumberDisplay from '~/components/numberDisplay';
import PositionDisplay from '~/components/PositionDisplay';
import { FoilProvider } from '~/lib/context/FoilProvider';
import { PeriodProvider } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
import { foilApi, tickToPrice, getExplorerUrl } from '~/lib/utils/util';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const usePosition = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['position', contractId, positionId],
    queryFn: async () => {
      return foilApi.get(`/positions/${positionId}?contractId=${contractId}`);
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const PositionPage = ({
  params,
}: {
  params: { id: string; position: string };
}) => {
  const { id, position } = params;
  const [chainId, marketAddress] = id.split('%3A'); // Decoded contractId
  const positionId = position;

  const contractId = `${chainId}:${marketAddress}`;

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
  } = usePosition(contractId, positionId);

  const { data: resources } = useResources();

  const resource = resources?.find((r) =>
    r.marketGroups.some(
      (m) =>
        m.chainId === Number(chainId) &&
        m.address.toLowerCase() === marketAddress.toLowerCase()
    )
  );

  const renderPositionData = () => {
    if (isLoadingPosition) {
      return (
        <div className="w-full text-center p-4">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      );
    }
    if (positionError) {
      return (
        <div className="w-full text-center p-4 text-destructive">
          Error: {(positionError as Error).message}
        </div>
      );
    }
    if (positionData) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              <PositionDisplay
                positionId={positionId}
                marketType={
                  positionData.market.marketGroup.isYin ? 'yin' : 'yang'
                }
              />
            </h1>
            <div
              className={cn(
                badgeVariants({ variant: 'default' }),
                'text-sm font-medium'
              )}
            >
              {positionData.isLP ? 'Liquidity Provider' : 'Trader'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {resource && (
              <div className="md:col-span-2 space-y-1">
                <p className="text-sm text-muted-foreground">Market</p>
                <div>{resource.name}</div>
              </div>
            )}

            <div className="md:col-span-2 space-y-1">
              <p className="text-sm text-muted-foreground">Smart Contract</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium font-mono">
                  {chainId}:{marketAddress}
                </p>
                <a
                  href={getExplorerUrl(parseInt(chainId, 10), marketAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-500 hover:text-blue-600 -translate-y-0.5"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <p className="text-sm text-muted-foreground">Owner</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium font-mono">
                  {positionData.owner}
                </p>
                <a
                  href={getExplorerUrl(
                    parseInt(chainId, 10),
                    positionData.owner
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-500 hover:text-blue-600 -translate-y-0.5"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Period</p>
              <div>
                <MarketTiming
                  startTimestamp={positionData.market.startTimestamp}
                  endTimestamp={positionData.market.endTimestamp}
                />
                <span className="text-xs text-muted-foreground ml-1">
                  (ID: {positionData.market.marketId})
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Collateral</p>
              <p>
                <NumberDisplay value={positionData.collateral} /> wstETH
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Base Token</p>
              <p>
                <NumberDisplay value={positionData.baseToken} /> Ggas
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Quote Token</p>
              <p>
                <NumberDisplay value={positionData.quoteToken} /> wstETH
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Borrowed Base Token
              </p>
              <p>
                <NumberDisplay value={positionData.borrowedBaseToken} /> Ggas
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Borrowed Quote Token
              </p>
              <p>
                <NumberDisplay value={positionData.borrowedQuoteToken} /> wstETH
              </p>
            </div>

            {positionData.isLP ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Low Price</p>
                  <p>
                    <NumberDisplay
                      value={tickToPrice(positionData.lowPriceTick)}
                    />{' '}
                    Ggas/wstETH
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">High Price</p>
                  <p>
                    <NumberDisplay
                      value={tickToPrice(positionData.highPriceTick)}
                    />{' '}
                    Ggas/wstETH
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1 md:col-span-2">
                <p className="text-sm text-muted-foreground">Size</p>
                <p>
                  <NumberDisplay
                    value={
                      positionData.baseToken - positionData.borrowedBaseToken
                    }
                  />{' '}
                  Ggas
                </p>
              </div>
            )}

            {positionData.isSettled && (
              <div className="md:col-span-2 pt-2">
                <div
                  className={cn(
                    badgeVariants({ variant: 'secondary' }),
                    'text-sm font-medium'
                  )}
                >
                  Settled
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <FoilProvider>
      <PeriodProvider
        chainId={Number(chainId)}
        address={marketAddress}
        market={Number(positionData?.market?.marketId)}
      >
        <div className="flex-1 flex items-center justify-center min-h-[calc(100dvh-69px)] p-4">
          <div className="w-full max-w-[480px]">
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
              {renderPositionData()}
            </div>
          </div>
        </div>
      </PeriodProvider>
    </FoilProvider>
  );
};

export default PositionPage;
