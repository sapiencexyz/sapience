'use client';

import { FormProvider, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/sapience/ui/index';
import { useQueries } from '@tanstack/react-query';
import { parseUnits } from 'viem';
import IndividualPositionRow from './IndividualPositionRow';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { getChainShortName } from '~/lib/utils/util';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import QuoteDisplay from '~/components/markets/forms/shared/QuoteDisplay';
import { getQuoteParamsFromPosition } from '~/hooks/forms/useMultiQuoter';
import { generateQuoteQueryKey } from '~/hooks/forms/useQuoter';
import { fetchQuoteByUrl, toQuoteUrl } from '~/hooks/forms/quoteApi';
import { useSettings } from '~/lib/context/SettingsContext';

interface BetslipSinglesFormProps {
  methods: UseFormReturn<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function BetslipSinglesForm({
  methods,
  onSubmit,
  isSubmitting,
}: BetslipSinglesFormProps) {
  const { positionsWithMarketData, betSlipPositions, removePosition } =
    useBetSlipContext();
  const { quoterBaseUrl, apiBaseUrl: relayerBaseUrl } = useSettings();

  const hasAtLeastOneLoadedQuestion = positionsWithMarketData.some(
    (p) =>
      !p.isLoading && !p.error && p.marketGroupData && p.marketClassification
  );

  // Watch all per-position form values for dynamic quote recomputation
  const positionsForm = methods.watch('positions');

  // Build quote queries for each position to compute a total "To Win"
  const quoteQueries = useQueries({
    queries: positionsWithMarketData.map((p) => {
      const positionId = p.position.id;
      const marketData =
        p.marketGroupData ||
        ({
          chainId: p.position.chainId,
          address: p.position.marketAddress,
        } as unknown as any);

      const predictionValue =
        positionsForm?.[positionId]?.predictionValue || '';
      const wagerAmount = positionsForm?.[positionId]?.wagerAmount || '';

      const params = getQuoteParamsFromPosition({
        positionId,
        marketGroupData: marketData,
        marketClassification:
          p.marketClassification || MarketGroupClassificationEnum.YES_NO,
        predictionValue,
        wagerAmount,
        selectedMarketId: p.position.marketId,
        isFlipped: positionsForm?.[positionId]?.isFlipped,
      });

      // Parse wager to bigint for a stable key
      let parsed: bigint | null = null;
      try {
        parsed =
          wagerAmount && Number(wagerAmount) > 0
            ? parseUnits(wagerAmount as `${number}`, 18)
            : null;
      } catch {
        parsed = null;
      }

      const key = generateQuoteQueryKey(
        marketData?.chainId,
        marketData?.address,
        params.marketId,
        params.expectedPrice,
        parsed
      );

      return {
        queryKey: key,
        enabled:
          !!marketData?.chainId &&
          !!marketData?.address &&
          !!params.marketId &&
          Number.isFinite(params.expectedPrice) &&
          !!parsed &&
          parsed > BigInt(0),
        queryFn: async (): Promise<{ maxSize: string }> => {
          const baseCandidate =
            quoterBaseUrl ||
            relayerBaseUrl ||
            process.env.NEXT_PUBLIC_FOIL_API_URL ||
            '';
          const apiUrl = toQuoteUrl({
            baseCandidate,
            marketData: marketData,
            marketId: params.marketId,
            expectedPrice: params.expectedPrice,
            collateralAvailable: parsed as bigint,
          });
          const data = await fetchQuoteByUrl(apiUrl);
          return { maxSize: data?.maxSize ?? '0' };
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
        retry: 1,
      };
    }),
  });

  const hasMultiple = positionsWithMarketData.length > 1;

  const { totalMaxSize, anyLoading } = (() => {
    try {
      const total = quoteQueries.reduce((acc, q) => {
        const size = q.data?.maxSize ? BigInt(q.data.maxSize) : 0n;
        return acc + (size < 0n ? -size : size);
      }, 0n);
      const loading = quoteQueries.some((q) => q.isLoading || q.isFetching);
      return { totalMaxSize: total.toString(), anyLoading: loading };
    } catch {
      return {
        totalMaxSize: '0',
        anyLoading: quoteQueries.some((q) => q.isLoading || q.isFetching),
      };
    }
  })();

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="p-4">
        {positionsWithMarketData.map((positionData, index) => {
          const isLast = index === positionsWithMarketData.length - 1;
          return (
            <div
              key={positionData.position.id}
              className={`mb-4 ${!isLast ? 'border-b border-border pb-5' : ''}`}
            >
              {positionData.error && (
                <>
                  <div className="mb-2">
                    <h3 className="text-md text-foreground pr-2">
                      {positionData.position.question}
                    </h3>
                  </div>
                  <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
                    Error loading market data
                    <br />
                    <small>
                      Chain: {positionData.position.chainId} (
                      {getChainShortName(positionData.position.chainId)})
                      <br />
                      Market: {positionData.position.marketAddress}
                    </small>
                  </div>
                </>
              )}

              <IndividualPositionRow
                positionId={positionData.position.id}
                question={positionData.position.question}
                marketGroupData={positionData.marketGroupData}
                marketClassification={
                  positionData.marketClassification ||
                  MarketGroupClassificationEnum.YES_NO
                }
                selectedMarketId={positionData.position.marketId}
                onRemove={() => removePosition(positionData.position.id)}
              />
            </div>
          );
        })}

        {hasAtLeastOneLoadedQuestion && (
          <>
            {hasMultiple && (
              <div className="mb-4">
                <QuoteDisplay
                  quoteData={{ maxSize: totalMaxSize }}
                  quoteError={null}
                  isLoading={anyLoading}
                  marketGroupData={
                    positionsWithMarketData[0]?.marketGroupData ||
                    ({
                      chainId: positionsWithMarketData[0]?.position.chainId,
                      address:
                        positionsWithMarketData[0]?.position.marketAddress,
                      collateralSymbol: 'testUSDe',
                    } as unknown as any)
                  }
                  marketClassification={MarketGroupClassificationEnum.YES_NO}
                  predictionValue={''}
                  label="Total To Win:"
                />
              </div>
            )}
            <WagerDisclaimer className="mt-2 mb-3" />
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                positionsWithMarketData.some((p) => p.isLoading) || isSubmitting
              }
            >
              Submit Wager{betSlipPositions.length > 1 ? 's' : ''}
            </Button>
          </>
        )}
      </form>
    </FormProvider>
  );
}
