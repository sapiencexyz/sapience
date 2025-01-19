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
const APP_DESCRIPTION =
  'The fully decentralized marketplace for onchain resources';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: '%s | Foil' },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    url: 'https://foil.xyz',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
  },
  twitter: {
    creator: '@foilxyz',
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#FFFFFF',
  viewportFit: 'cover',
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
