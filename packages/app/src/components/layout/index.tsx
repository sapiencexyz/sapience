'use client';

import {
  SidebarInset,
  SidebarProvider,
} from '@sapience/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

import Header from './Header';
import Footer from './Footer';
import BannerCoordinator from '~/components/shared/BannerCoordinator';

const ContentArea = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarInset
      className={`p-0 m-0 w-full max-w-none !bg-transparent h-full min-h-0 flex flex-col`}
    >
      {children}
    </SidebarInset>
  );
};

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '12rem' } as React.CSSProperties}
    >
      <div
        className="min-h-[100dvh] flex flex-col w-full relative z-10"
        style={
          {
            '--page-top-offset':
              'calc(var(--banner-offset, 0px) + var(--header-height, 0px))',
          } as React.CSSProperties
        }
      >
        <BannerCoordinator />
        <Header />
        <div className="flex-1 flex w-full">
          <ContentArea>{children}</ContentArea>
        </div>
        {/* Desktop footer */}
        <div className="hidden xl:block">
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
