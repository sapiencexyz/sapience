'use client';

import type { ReactNode } from 'react';

import EarnResourceNav from '~/components/market/EarnResourceNav';

export default function EarnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col w-full">
      <EarnResourceNav />
      {children}
    </div>
  );
}
