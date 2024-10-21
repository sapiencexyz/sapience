import { Tooltip, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { shortenAddress } from '~/lib/util/util';

interface Props {
  address: string;
  showFull?: boolean;
}
const COPY_TO_CLIPBOARD = 'copy to clipboard';

const MarketAddress = ({ address, showFull }: Props) => {
  const [tooltipText, setTooltipText] = useState('');

  const handleTooltipCopy = (
    e: React.MouseEvent<HTMLSpanElement, MouseEvent>
  ) => {
    e.stopPropagation(); // stops the click event from bubbling up to the parent element
    navigator.clipboard.writeText(address);
    setTooltipText('copied!');
    setTimeout(() => {
      setTooltipText('');
    }, 2000);
  };

  return (
    <Tooltip
      label={tooltipText}
      hasArrow
      placement="top-start"
      isOpen={!!tooltipText}
    >
      <Text
        onClick={(e: React.MouseEvent<HTMLSpanElement, MouseEvent>) => {
          handleTooltipCopy(e);
        }}
        cursor="pointer"
        onMouseOverCapture={() => setTooltipText(COPY_TO_CLIPBOARD)}
        onMouseEnter={() => setTooltipText(COPY_TO_CLIPBOARD)}
        onMouseLeave={() => {
          if (tooltipText === COPY_TO_CLIPBOARD) {
            setTooltipText('');
          }
        }}
      >
        {showFull ? address : shortenAddress(address)}
      </Text>
    </Tooltip>
  );
};

export default MarketAddress;
