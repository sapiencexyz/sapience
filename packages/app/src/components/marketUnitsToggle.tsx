import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import type React from 'react';
import { useContext } from 'react';

import { PeriodContext } from '../lib/context/PeriodProvider';

const MarketUnitsToggle: React.FC = () => {
  const { useMarketUnits, setUseMarketUnits } = useContext(PeriodContext);

  return (
    <Tabs
      value={useMarketUnits ? 'wsteth' : 'gwei'}
      onValueChange={(value) => setUseMarketUnits(value === 'wsteth')}
    >
      <TabsList>
        <TabsTrigger value="wsteth">Ggas/wstETH</TabsTrigger>
        <TabsTrigger value="gwei">gwei</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export default MarketUnitsToggle;
