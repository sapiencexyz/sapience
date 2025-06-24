import { Toaster } from '@sapience/ui/components/ui/toaster';
import type { Metadata, Viewport } from 'next';
import type React from 'react';

import Providers from '~/app/providers';
import '@rainbow-me/rainbowkit/styles.css';
import '../lib/styles/globals.css';
import InstallDialog from '~/components/InstallDialog';
import Layout from '~/components/layout';
import LoadingSpinner from '~/components/loadingSpinner';
import { LoadingProvider } from '~/lib/context/LoadingContext';

type RootLayoutProps = {
  children: React.ReactNode;
};

const APP_NAME = 'Foil';
const APP_DESCRIPTION =
  'Foil is a fully decentralized marketplace connecting producers of onchain computing resources with consumers.';
const LARGE_ICON_PATH = '/icons/icon-512x512.png';
const DEFAULT_OG_IMAGE = 'https://foil.xyz/og-image.png';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: '%s | Foil' },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  metadataBase: new URL('https://foil.xyz'),
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
    title: {
      default: APP_NAME,
      template: '%s | Foil',
    },
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    locale: 'en_US',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Foil is a fully decentralized marketplace connecting producers of onchain computing resources with consumers.',
      },
    ],
  },
  twitter: {
    creator: '@sapiencexyz',
    site: '@sapiencexyz',
    card: 'summary_large_image',
    title: {
      default: APP_NAME,
      template: '%s | Foil',
    },
    description: APP_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
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
