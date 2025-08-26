import type { MarketGroupType } from '@sapience/ui/types';
import YesNoWagerInput from './YesNoWagerInput';
import MultipleChoiceWagerInput from './MultipleChoiceWagerInput';
import NumericWagerInput from './NumericWagerInput';
import { MarketGroupClassification } from '~/lib/types';

interface WagerInputFactoryProps {
  marketClassification: MarketGroupClassification;
  marketGroupData: MarketGroupType;
  positionId: string;
  defaultSelectedMarketId?: number;
}

export default function WagerInputFactory({
  marketClassification,
  marketGroupData,
  positionId,
  defaultSelectedMarketId,
}: WagerInputFactoryProps) {
  switch (marketClassification) {
    case MarketGroupClassification.YES_NO:
      return (
        <YesNoWagerInput
          marketGroupData={marketGroupData}
          positionId={positionId}
        />
      );
    case MarketGroupClassification.MULTIPLE_CHOICE:
      return (
        <MultipleChoiceWagerInput
          marketGroupData={marketGroupData}
          positionId={positionId}
          defaultSelectedMarketId={defaultSelectedMarketId}
        />
      );
    case MarketGroupClassification.NUMERIC:
      return (
        <NumericWagerInput
          marketGroupData={marketGroupData}
          positionId={positionId}
        />
      );
    default:
      return <div>Unsupported market type for wagers</div>;
  }
}
