import type { ComponentStyleConfig } from '@chakra-ui/react';

export const Stat: ComponentStyleConfig = {
  baseStyle: {
    container: {
      border: '1px solid',
      borderColor: 'gray.300',
      borderRadius: 'md',
      py: 4,
      px: 6,
    },
    label: {
      fontWeight: 700,
      color: 'gray.800',
    },
    number: {
      fontWeight: 700,
      color: 'gray.800',
    },
    helpText: {
      color: 'gray.800',
      fontWeight: 500,
      mb: 0,
    },
    arrow: {
      increase: {
        color: 'green.400',
      },
      decrease: {
        color: 'red.500',
      },
    },
    span: {
      fontWeight: 600,
      fontSize: 'lg',
      color: 'gray.800',
    },
  },
};
