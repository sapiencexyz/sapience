import type React from 'react';
import { useContext } from 'react';

import { MarketContext } from '../lib/context/MarketProvider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MarketUnitsToggle: React.FC = () => {
  const { useMarketUnits, setUseMarketUnits } = useContext(MarketContext);

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
