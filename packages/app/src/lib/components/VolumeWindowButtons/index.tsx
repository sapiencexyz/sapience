import { Button, ButtonGroup } from '@chakra-ui/react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { TimeWindow } from '~/lib/interfaces/interfaces';

interface VolumeWindowSelectorProps {
  setSelectedWindow: Dispatch<SetStateAction<TimeWindow>>;
  selectedWindow: TimeWindow;
}

const VolumeWindowSelector: React.FC<VolumeWindowSelectorProps> = ({
  setSelectedWindow,
  selectedWindow,
}) => {
  const handleSelect = (window: TimeWindow) => {
    setSelectedWindow(window);
  };

  return (
    <ButtonGroup
      size="sm"
      isAttached
      variant="outline"
      borderRadius="full"
      bg="gray.100"
    >
      {Object.values(TimeWindow).map((window) => (
        <Button
          key={window}
          onClick={() => handleSelect(window)}
          bg={selectedWindow === window ? 'gray.200' : 'transparent'}
          _hover={{ bg: 'gray.250' }}
          borderRadius="full"
          fontWeight={selectedWindow === window ? 'bold' : 'normal'}
        >
          {window}
        </Button>
      ))}
    </ButtonGroup>
  );
};

export default VolumeWindowSelector;
