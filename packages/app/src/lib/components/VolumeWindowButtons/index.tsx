import { Button, ButtonGroup, useColorModeValue } from '@chakra-ui/react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { VolumeWindow } from '~/lib/interfaces/interfaces';

interface VolumeWindowSelectorProps {
  setSelectedWindow: Dispatch<SetStateAction<VolumeWindow>>;
  selectedWindow: VolumeWindow;
}

const VolumeWindowSelector: React.FC<VolumeWindowSelectorProps> = ({
  setSelectedWindow,
  selectedWindow,
}) => {
  const bg = useColorModeValue('gray.200', 'gray.700');
  const selectedBg = useColorModeValue('gray.300', 'gray.600');
  const hoverBg = useColorModeValue('gray.250', 'gray.650');

  const handleSelect = (window: VolumeWindow) => {
    setSelectedWindow(window);
  };

  return (
    <ButtonGroup
      size="sm"
      isAttached
      variant="outline"
      borderRadius="full"
      bg={bg}
      p={1}
    >
      {Object.values(VolumeWindow).map((window) => (
        <Button
          key={window}
          onClick={() => handleSelect(window)}
          bg={selectedWindow === window ? selectedBg : 'transparent'}
          _hover={{ bg: hoverBg }}
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
