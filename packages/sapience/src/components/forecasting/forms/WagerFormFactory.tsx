import { MarketGroupType } from '@foil/ui/types';
import { MarketGroupCategory } from '~/hooks/graphql/useMarketGroup';
import { NumericWagerForm } from './wager/NumericWagerForm';
import { SingleChoiceWagerForm } from './wager/SingleChoiceWagerForm';
import { YesNoWagerForm } from './wager/YesNoWagerForm';

interface WagerFormFactoryProps {
  marketCategory: MarketGroupCategory;
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
}

export function WagerFormFactory(props: WagerFormFactoryProps) {
  const { marketCategory, ...restOfProps } = props;

  switch (marketCategory) {
    case MarketGroupCategory.SINGLE_CHOICE:
      return <SingleChoiceWagerForm {...restOfProps} />;
    case MarketGroupCategory.NUMERIC:
      return <NumericWagerForm {...restOfProps} />;
    case MarketGroupCategory.YES_NO:
      return <YesNoWagerForm {...restOfProps} />;
    default:
      return <div>Unsupported market type for wagers</div>;
  }
}
