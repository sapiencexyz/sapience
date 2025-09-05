import type { MarketGroupType } from '@sapience/ui/types';
import NumericPredict from './NumericPredict';
import { WagerInput } from './WagerInput';
import { tickToPrice } from '~/lib/utils/tickUtils';

interface NumericWagerInputProps {
  marketGroupData: MarketGroupType;
  positionId: string; // Used to namespace form fields
}

export default function NumericWagerInput({
  marketGroupData,
  positionId,
}: NumericWagerInputProps) {
  const predictionFieldName = `positions.${positionId}.predictionValue`;
  const wagerAmountFieldName = `positions.${positionId}.wagerAmount`;

  const firstMarket = marketGroupData.markets?.[0];
  const lowerBound = tickToPrice(firstMarket?.baseAssetMinPriceTick ?? 0);
  const upperBound = tickToPrice(firstMarket?.baseAssetMaxPriceTick ?? 0);

  return (
    <div className="space-y-4">
      <NumericPredict
        name={predictionFieldName}
        bounds={{
          lowerBound,
          upperBound,
        }}
        baseTokenName={marketGroupData.baseTokenName || ''}
        quoteTokenName={marketGroupData.quoteTokenName || ''}
        decimalPlaces={6}
      />

      <WagerInput
        name={wagerAmountFieldName}
        collateralSymbol={marketGroupData.collateralSymbol || 'testUSDe'}
        collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
        chainId={marketGroupData.chainId}
      />
    </div>
  );
}
