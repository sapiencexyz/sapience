'use client';

import type { ReactNode } from 'react';

import Header from './Header';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';

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
            '--page-top-offset': 'var(--header-height, 0px)',
          } as React.CSSProperties
        }
      >
        <Header />
        <div className="flex-1 flex w-full">
          <ContentArea>{children}</ContentArea>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
