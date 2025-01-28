'use client';

import type { ReactNode } from 'react';

import Header from './Header';

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="pb-[57px] lg:pb-0">
        <Header />
        <main className="flex-1 flex">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
