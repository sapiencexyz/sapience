import type { MarketGroupType } from '@foil/ui/types';

import { MarketGroupClassification } from '~/hooks/graphql/useMarketGroup';

import MultipleChoiceWagerForm from './wager/MultipleChoiceWagerForm';
import NumericWagerForm from './wager/NumericWagerForm';
import YesNoWagerForm from './wager/YesNoWagerForm';

interface WagerFormFactoryProps {
  marketClassification: MarketGroupClassification;
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export default function WagerFormFactory(props: WagerFormFactoryProps) {
  const { marketClassification, ...restOfProps } = props;

  switch (marketClassification) {
    case MarketGroupClassification.MULTIPLE_CHOICE:
      return <MultipleChoiceWagerForm {...restOfProps} />;
    case MarketGroupClassification.NUMERIC:
      return <NumericWagerForm {...restOfProps} />;
    case MarketGroupClassification.YES_NO:
      return <YesNoWagerForm {...restOfProps} />;
    default:
      return <div>Unsupported market type for wagers</div>;
  }
}
