'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, ExternalLink } from 'lucide-react';

import EpochTiming from '~/components/EpochTiming';
import NumberDisplay from '~/components/numberDisplay';
import { badgeVariants } from '~/components/ui/badge';
import { API_BASE_URL } from '~/lib/constants/constants';
import { PeriodProvider } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
import { tickToPrice } from '~/lib/util/util';
import { cn } from '~/lib/utils';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const getBlockExplorerUrl = (chainId: string, address: string) => {
  switch (chainId) {
    case '11155111':
      return `https://sepolia.etherscan.io/address/${address}`;
    case '8453':
      return `https://basescan.org/address/${address}`;
    default:
      return `https://etherscan.io/address/${address}`;
  }
};

const usePosition = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['position', contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/positions/${positionId}?contractId=${contractId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
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
    r.markets.some(
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
            <h1 className="text-2xl font-bold">Position #{positionId}</h1>
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
                  href={getBlockExplorerUrl(chainId, marketAddress)}
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
                  href={getBlockExplorerUrl(chainId, positionData.owner)}
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
                <EpochTiming
                  startTimestamp={positionData.epoch.startTimestamp}
                  endTimestamp={positionData.epoch.endTimestamp}
                />
                <span className="text-xs text-muted-foreground ml-1">
                  (ID: {positionData.epoch.epochId})
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
                <p className="font-medium">
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
    <PeriodProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(positionData?.epoch?.id)}
    >
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
        <div className="w-full max-w-[480px]">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
            {renderPositionData()}
          </div>
        </div>
      </div>
    </PeriodProvider>
  );
};

export default PositionPage;
