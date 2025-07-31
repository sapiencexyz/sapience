import { Label } from '@sapience/ui/components/ui/label';

import type { MarketGroupType } from '@sapience/ui/types';
import MultipleChoicePredict from './MultipleChoicePredict';
import { WagerInput } from './WagerInput';

interface MultipleChoiceWagerInputProps {
  marketGroupData: MarketGroupType;
  positionId: string; // Used to namespace form fields
}

export default function MultipleChoiceWagerInput({
  marketGroupData,
  positionId,
}: MultipleChoiceWagerInputProps) {
  const predictionFieldName = `positions.${positionId}.predictionValue`;
  const wagerAmountFieldName = `positions.${positionId}.wagerAmount`;

  return (
    <div className="space-y-4">
      <div>
        <Label>Your Prediction</Label>
        <MultipleChoicePredict
          name={predictionFieldName}
          options={(marketGroupData.markets || []).map((market) => ({
            name: market.optionName || '',
            marketId: market.marketId,
          }))}
          variant="dropdown"
        />
      </div>

      <WagerInput
        name={wagerAmountFieldName}
        collateralSymbol={marketGroupData.collateralSymbol || 'tokens'}
        collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
        chainId={marketGroupData.chainId}
      />
    </div>
  );
}
