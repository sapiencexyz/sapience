import type { Metadata, Viewport } from 'next';

import Providers from '~/app/providers';
import '@rainbow-me/rainbowkit/styles.css';
import '../lib/styles/globals.css';
import { LoadingSpinner } from '~/lib/components/foil/loadingSpinner';
import { LoadingProvider } from '~/lib/context/LoadingContext';
import { Toaster } from '@/components/ui/toaster';
import Layout from '~/lib/layout';

type RootLayoutProps = {
  children: React.ReactNode;
};

const APP_NAME = 'Foil';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: '%s | Foil' },
  description: 'Foil App',
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    url: 'https://foil.xyz',
    title: 'Foil',
    description: '',
    images: {
      url: '',
      alt: 'foil og-image',
    },
  },
  twitter: {
    creator: '@foilxyz',
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body>
        <Providers>
          <LoadingProvider>
            <LoadingSpinner />
            <Layout>{children}</Layout>
            <Toaster />
          </LoadingProvider>
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
