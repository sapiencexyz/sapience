import { IconButton, Tooltip } from '@chakra-ui/react';
import type React from 'react';
import { useContext } from 'react';
import { BsArrowLeftRight } from 'react-icons/bs';

import { MarketContext } from '../../context/MarketProvider';

const MarketUnitsToggle: React.FC = () => {
  const { useMarketUnits, setUseMarketUnits } = useContext(MarketContext);

  return (
    <Tooltip label="Toggle units">
      <IconButton
        size="sm"
        mr={3}
        aria-label="Toggle Units"
        icon={<BsArrowLeftRight />}
        onClick={() => setUseMarketUnits(!useMarketUnits)}
      />
    </Tooltip>
  );
};

export default MarketUnitsToggle;
