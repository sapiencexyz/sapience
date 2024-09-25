import { ChevronUpIcon, ChevronDownIcon, CheckIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ChartType } from '~/lib/interfaces/interfaces';

interface CustomDropdownProps {
  chartType: ChartType;
  setChartType: Dispatch<SetStateAction<ChartType>>;
}

const ChartSelector: React.FC<CustomDropdownProps> = ({
  chartType,
  setChartType,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  //   const bg = useColorModeValue('gray.800', 'gray.800');
  //   const hoverBg = useColorModeValue('gray.700', 'gray.700');
  //   const textColor = useColorModeValue('white', 'white');

  const bg = useColorModeValue('gray.200', 'gray.700');
  const selectedBg = useColorModeValue('gray.300', 'gray.600');
  const hoverBg = useColorModeValue('gray.250', 'gray.650');

  const handleSelect = (option: ChartType) => {
    setChartType(option);
    setIsOpen(false);
  };

  return (
    <Menu isOpen={isOpen} onClose={() => setIsOpen(false)}>
      <MenuButton
        as={Button}
        rightIcon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        bg={bg}
        //  color={textColor}
        _hover={{ bg: hoverBg }}
        _active={{ bg: hoverBg }}
        onClick={() => setIsOpen(!isOpen)}
        borderRadius="full"
        px={4}
        py={2}
      >
        {chartType}
      </MenuButton>
      <MenuList bg={bg} borderColor={hoverBg} borderWidth={1}>
        {Object.values(ChartType).map((option) => (
          <MenuItem
            key={option}
            onClick={() => handleSelect(option as ChartType)}
            bg={bg}
            _hover={{ bgColor: selectedBg }}
          >
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
              fontWeight={option === chartType ? 'bold' : 'normal'}
            >
              {option}
              {option === chartType && <Icon as={CheckIcon} color="black" />}
            </Box>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default ChartSelector;
