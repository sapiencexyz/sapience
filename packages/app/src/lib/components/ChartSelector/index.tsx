import { ChevronUpIcon, ChevronDownIcon, CheckIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Icon,
} from '@chakra-ui/react';
import { useContext, useState } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';
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
  const { epochSettled } = useContext(MarketContext);

  const handleSelect = (option: ChartType) => {
    setChartType(option);
    setIsOpen(false);
  };

  const renderChartType = (option: ChartType) => {
    if (epochSettled && option === ChartType.LIQUIDITY) return null;
    return (
      <MenuItem
        key={option}
        onClick={() => handleSelect(option as ChartType)}
        bg="gray.100"
        _hover={{ bg: 'gray.200' }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          fontWeight={option === chartType ? 'bold' : 'normal'}
        >
          {option}
          {option === chartType && <Icon as={CheckIcon} />}
        </Box>
      </MenuItem>
    );
  };

  return (
    <Menu isOpen={isOpen} onClose={() => setIsOpen(false)}>
      <MenuButton
        as={Button}
        rightIcon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        bg="gray.100"
        _hover={{ bg: 'gray.200' }}
        _active={{ bg: 'gray.200' }}
        onClick={() => setIsOpen(!isOpen)}
        borderRadius="full"
        size="sm"
      >
        {chartType}
      </MenuButton>
      <MenuList bg="gray.100" borderColor="gray.200" borderWidth={1}>
        {Object.values(ChartType).map((option) => renderChartType(option))}
      </MenuList>
    </Menu>
  );
};

export default ChartSelector;
