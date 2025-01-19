import type { Metadata, Viewport } from 'next';

import Layout from '@/lib/layout';
import { fontSans } from '@/lib/styles/fonts';
import { cn } from '@/lib/styles/utils';
import { Analytics } from '@vercel/analytics/react';

import '@/lib/styles/globals.css';

const APP_NAME = 'Foil';
const APP_DESCRIPTION =
  'The fully decentralized marketplace for onchain resources';

export const metadata: Metadata = {
  title: APP_NAME,
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
    url: 'https://foil.xyz',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: {
      url: '',
      alt: 'foil.xyz og-image',
    },
  },
  twitter: {
    creator: '@foilxyz',
    card: 'summary_large_image',
  },
  icons: {
    icon: '/assets/favicon.svg',
    shortcut: '/assets/favicon.svg',
    apple: '/assets/favicon.svg',
    other: {
      rel: 'mask-icon',
      url: '/assets/favicon.svg',
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          fontSans.variable
        )}
      >
        <Analytics />
        <Layout>
          <div className="flex-1">{children}</div>
        </Layout>
      </body>
    </html>
  );
};

export default RootLayout;
