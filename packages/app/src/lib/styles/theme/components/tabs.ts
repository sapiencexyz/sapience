import type { ComponentStyleConfig } from '@chakra-ui/react';

export const Tabs: ComponentStyleConfig = {
  baseStyle: {
    tab: {
      fontWeight: 500,
      color: 'gray.800',
      _selected: {
        fontWeight: 700,
        color: 'black',
        borderColor: 'black',
        borderBottomWidth: '2px',
      },
      _hover: {
        color: 'gray.800',
      },
      _active: {
        background: 'none',
      },
    },
    tablist: {
      borderBottom: '1px solid',
      borderColor: 'gray.300',
    },
    tabpanel: {
      p: 0,
    },
  },
};
