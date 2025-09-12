import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput } from './WagerInput';
import MultipleChoiceWagerChoiceSelect from './MultipleChoiceWager';

interface MultipleChoiceWagerInputProps {
  marketGroupData: MarketGroupType;
  positionId: string; // Used to namespace form fields
  defaultSelectedMarketId?: number;
}

export default function MultipleChoiceWagerInput({
  marketGroupData,
  positionId,
  defaultSelectedMarketId,
}: MultipleChoiceWagerInputProps) {
  const predictionFieldName = `positions.${positionId}.predictionValue`;
  const wagerAmountFieldName = `positions.${positionId}.wagerAmount`;
  const isFlippedFieldName = `positions.${positionId}.isFlipped`;

  return (
    <div className="space-y-4">
      <div>
        <MultipleChoiceWagerChoiceSelect
          name={predictionFieldName}
          options={(marketGroupData.markets || [])
            .slice()
            .sort((a, b) => a.marketId - b.marketId)
            .map((market) => ({
              name: market.optionName || `Market ${market.marketId}`,
              marketId: market.marketId,
            }))}
          defaultValue={
            typeof defaultSelectedMarketId === 'number'
              ? String(defaultSelectedMarketId)
              : undefined
          }
          // The flip state is managed via a form field for per-input behavior
          isFlipped={undefined}
        />
      </div>

      <WagerInput
        name={wagerAmountFieldName}
        collateralSymbol={marketGroupData.collateralSymbol || 'testUSDe'}
        collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
        chainId={marketGroupData.chainId}
      />
      {/* Hidden field to carry per-input flip state */}
      <input type="hidden" name={isFlippedFieldName} />
    </div>
  );
}
