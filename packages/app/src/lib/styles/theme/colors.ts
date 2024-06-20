import type { DeepPartial, Theme } from '@chakra-ui/react';

/** extend additional color here */
const extendedColors: DeepPartial<
  Record<string, Theme['colors']['blackAlpha']>
> = {
  brand: {
    100: '',
    200: '',
    300: '',
    400: '',
    500: '',
    600: '',
    700: '',
    800: '',
    900: '',
  },
};

/** override chakra colors here */
const overridenChakraColors: DeepPartial<Theme['colors']> = {
  gray: {
    50: '#F8F7F5', // "Foil Neutral"
    300: '#DAD8D1', // "Foil Rule"
    800: '#2C2C2E', // "Foil Black"
  },
  red: {
    500: '#FF0000',
  },
  green: {
    400: '#3FBC44',
  },
};

export const colors = {
  ...overridenChakraColors,
  ...extendedColors,
};
