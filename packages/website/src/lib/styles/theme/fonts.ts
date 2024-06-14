import type { DeepPartial, Theme } from '@chakra-ui/react';
// import { Figtree as FontBody } from 'next/font/google';

/*
export const fontBody = FontBody({
  subsets: ['latin'],
  variable: '--font-body',
});
*/

export const fonts: DeepPartial<Theme['fonts']> = {
  heading: 'Avenir Next',
  body: 'Avenir Next',
};
