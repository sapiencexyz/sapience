import type { Metadata, Viewport } from 'next';
import type React from 'react';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Toaster } from '@sapience/ui/components/ui/toaster';
import { TooltipProvider } from '@sapience/ui/components/ui/tooltip';
import Providers from '~/app/providers';
import { ibmPlexMono } from '~/app/fonts';
import Layout from '~/components/layout';
import ChatWidget from '~/components/shared/ChatWidget';
import CommandMenu from '~/components/shared/CommandMenu';
import ConsoleMessage from '~/components/shared/ConsoleMessage';
import FloatingChatButton from '~/components/shared/FloatingChatButton';
import GlobalLoader from '~/components/shared/GlobalLoader';
import InstallDialog from '~/components/shared/InstallDialog';
import { ChatProvider } from '~/lib/context/ChatContext';
import { LoadingProvider } from '~/lib/context/LoadingContext';
import '~/styles/globals.css';

type RootLayoutProps = {
  children: React.ReactNode;
};

const APP_NAME = 'Sapience';
const APP_DESCRIPTION = 'Sapience Prediction Markets';
const LARGE_ICON_PATH = '/icons/icon-512x512.png';
const APP_URL = 'https://sapience.xyz';

// Bump this version to cache-bust OG images on external platforms (Twitter, Discord, etc.)
const OG_VERSION = 1;
const DEFAULT_OG_IMAGE = `${APP_URL}/og-image.png?v=${OG_VERSION}`;

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  metadataBase: new URL(APP_URL),
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' }],
    apple: [
      {
        url: LARGE_ICON_PATH,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico',
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
    url: APP_URL,
    title: {
      default: APP_NAME,
      template: '%s | Sapience',
    },
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    locale: 'en_US',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Sapience Prediction Markets',
      },
    ],
  },
  twitter: {
    creator: '@sapiencexyz',
    site: '@sapiencexyz',
    card: 'summary_large_image',
    title: {
      default: APP_NAME,
      template: '%s | Sapience',
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
  themeColor: 'black',
  viewportFit: 'cover',
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="overflow-x-hidden">
        <Providers>
          <LoadingProvider>
            <ChatProvider>
              <GlobalLoader />
              <TooltipProvider>
                <Layout>{children}</Layout>
              </TooltipProvider>
              <CommandMenu />
              <Toaster />
              <InstallDialog />
              <div className="fixed bottom-5 right-4 sm:bottom-14 sm:right-6 z-[55]">
                <Suspense fallback={null}>
                  <FloatingChatButton />
                </Suspense>
              </div>
              <ChatWidget />
              <ConsoleMessage />
            </ChatProvider>
          </LoadingProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
