import { Label } from '@sapience/ui/components/ui/label';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput } from './WagerInput';
import MultipleChoiceWagerChoiceSelect from './MultipleChoiceWager';

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
        <MultipleChoiceWagerChoiceSelect
          name={predictionFieldName}
          options={(marketGroupData.markets || []).map((market) => ({
            name: market.optionName || '',
            marketId: market.marketId,
          }))}
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
