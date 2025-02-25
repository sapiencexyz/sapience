'use client';

import type { ReactNode } from 'react';

import ResourceNav from '~/components/market/ResourceNav';

export default function ResourcesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col w-full">
      <ResourceNav />
      {children}
    </div>
  );
}
