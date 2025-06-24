'use client';

import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@sapience/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

import Header from './Header';

const ContentArea = ({ children }: { children: ReactNode }) => {
  const { state } = useSidebar();

  return (
    <SidebarInset
      className={`
        p-0 m-0 w-full max-w-none transition-all duration-300 ease-in-out
        ${state === 'expanded' ? 'md:ml-[var(--sidebar-width)] md:w-[calc(100%-var(--sidebar-width))]' : 'ml-0 w-full'}
      `}
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
      <div className="min-h-screen flex flex-col overflow-hidden w-full">
        <Header />
        <div className="flex-1 flex w-full">
          <ContentArea>{children}</ContentArea>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
