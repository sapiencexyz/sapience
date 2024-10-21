import type { DeepPartial, Theme } from '@chakra-ui/react';

export const gray700 = '#808080';
export const gray400 = '#666';

export const red500 = '#FF0000';

export const green400 = '#3FBC44';

export const turquoise = '#56B2A4';
export const paleGreen = '#82ca9d';
export const purple = '#8884d8';
export const peach = '#d8a184';

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
    400: gray400,
    700: gray700,
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
