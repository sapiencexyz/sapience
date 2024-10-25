import { createSystem, defaultConfig } from '@chakra-ui/react';

import { colors } from './colors';
import { components } from './components';
import { fonts } from './fonts';

export const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: fonts.heading },
        body: { value: fonts.body },
      },
      colors,
    },
    recipes: components,
  },
});

export default system;
