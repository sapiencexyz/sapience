export const gray700 = '#808080';
export const gray400 = '#666';

export const red500 = '#FF0000';

export const green400 = '#3FBC44';

export const turquoise = '#56B2A4';
export const paleGreen = '#82ca9d';
export const purple = '#8884d8';
export const peach = '#d8a184';

const overridenChakraColors = {
  gray: {
    50: { value: '#F8F7F5' }, // "Foil Neutral"
    300: { value: '#DAD8D1' }, // "Foil Rule"
    400: { value: gray400 },
    700: { value: gray700 },
    800: { value: '#2C2C2E' }, // "Foil Black"
  },
  red: {
    500: { value: '#FF0000' },
  },
  green: {
    400: { value: '#3FBC44' },
  },
};

export const colors = {
  ...overridenChakraColors,
};
