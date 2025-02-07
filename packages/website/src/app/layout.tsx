import type { Metadata, Viewport } from 'next';

import Layout from '@/components/layout';
import { fontSans } from '@/lib/styles/fonts';
import { cn } from '@/lib/styles/utils';
import { Analytics } from '@vercel/analytics/react';

import '@/lib/styles/globals.css';

const APP_NAME = 'Foil';
const APP_DESCRIPTION =
  'Foil is a fully decentralized marketplace connecting producers of onchain computing resources with consumers.';
const DEFAULT_OG_IMAGE = 'https://foil.xyz/assets/og-image.png';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: '%s | Foil' },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  metadataBase: new URL('https://foil.xyz'),
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
    title: {
      default: APP_NAME,
      template: '%s | Foil'
    },
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    locale: 'en_US',
    images: [{
      url: DEFAULT_OG_IMAGE,
      width: 1200,
      height: 630,
      alt: 'Foil is a fully decentralized marketplace connecting producers of onchain computing resources with consumers.',
    }],
  },
  twitter: {
    creator: '@foilxyz',
    site: '@foilxyz',
    card: 'summary_large_image',
    title: {
      default: APP_NAME,
      template: '%s | Foil'
    },
    description: APP_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
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
