import localFont from 'next/font/local';

export const fontSans = localFont({
  src: [
    // Regular weights
    {
      path: '../../../public/fonts/avenir-next/AvenirNextThin/font.woff2',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextUltraLight/font.woff2',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextLight/font.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextRegular/font.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextMedium/font.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextDemi/font.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextBold/font.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextExtraBold/font.woff2',
      weight: '800',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextHeavy/font.woff2',
      weight: '900',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextBlack/font.woff2',
      weight: '950',
      style: 'normal',
    },
    // Italic weights
    {
      path: '../../../public/fonts/avenir-next/AvenirNextThinItalic/font.woff2',
      weight: '100',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextUltraLightItalic/font.woff2',
      weight: '200',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextLightItalic/font.woff2',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextItalic/font.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextMediumItalic/font.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextDemiItalic/font.woff2',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextBoldItalic/font.woff2',
      weight: '700',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextExtraBoldItalic/font.woff2',
      weight: '800',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextHeavyItalic/font.woff2',
      weight: '900',
      style: 'italic',
    },
    {
      path: '../../../public/fonts/avenir-next/AvenirNextBlackItalic/font.woff2',
      weight: '950',
      style: 'italic',
    },
  ],
  variable: '--font-sans',
});
