import type { Metadata, Viewport } from 'next';
import type React from 'react';

import Providers from '~/app/providers';
import '@rainbow-me/rainbowkit/styles.css';
import '../lib/styles/globals.css';
import { LoadingSpinner } from '~/lib/components/foil/loadingSpinner';
import { InstallDialog } from '~/lib/components/InstallDialog';
import { LoadingProvider } from '~/lib/context/LoadingContext';
import { Toaster } from '@/components/ui/toaster';
import Layout from '~/lib/layout';

type RootLayoutProps = {
  children: React.ReactNode;
};

const APP_NAME = 'Foil';
const APP_DESCRIPTION =
  'The fully decentralized marketplace for onchain resources';
const LARGE_ICON_PATH = '/icons/icon-512x512.png';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: '%s | Foil' },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  icons: {
    icon: LARGE_ICON_PATH,
    apple: [
      {
        url: LARGE_ICON_PATH,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcut: LARGE_ICON_PATH,
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
    startupImage: [LARGE_ICON_PATH],
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
  themeColor: '#2C2C2E',
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
            <InstallDialog />
            <Toaster />
          </LoadingProvider>
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
