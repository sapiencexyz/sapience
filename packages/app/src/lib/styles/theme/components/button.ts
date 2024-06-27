import type { ComponentStyleConfig } from '@chakra-ui/react';

export const Button: ComponentStyleConfig = {
  baseStyle: {
    borderRadius: 'full',
    fontWeight: 500,
  },
  variants: {
    brand: {
      color: 'white',
      bg: 'gray.800',
      _hover: {
        bg: 'gray.900',
      },
    },
  },
};
