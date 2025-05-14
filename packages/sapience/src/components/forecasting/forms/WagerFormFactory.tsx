import type { MarketGroupType } from '@foil/ui/types';

import { MarketGroupCategory } from '~/hooks/graphql/useMarketGroup';

import MultipleChoiceWagerForm from './wager/MultipleChoiceWagerForm';
import NumericWagerForm from './wager/NumericWagerForm';
import YesNoWagerForm from './wager/YesNoWagerForm';

interface WagerFormFactoryProps {
  marketCategory: MarketGroupCategory;
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export default function WagerFormFactory(props: WagerFormFactoryProps) {
  const { marketCategory, ...restOfProps } = props;

  switch (marketCategory) {
    case MarketGroupCategory.MULTIPLE_CHOICE:
      return <MultipleChoiceWagerForm {...restOfProps} />;
    case MarketGroupCategory.NUMERIC:
      return <NumericWagerForm {...restOfProps} />;
    case MarketGroupCategory.YES_NO:
      return <YesNoWagerForm {...restOfProps} />;
    default:
      return <div>Unsupported market type for wagers</div>;
  }
}
