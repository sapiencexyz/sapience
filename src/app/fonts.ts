import { IBM_Plex_Mono } from 'next/font/google';

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
