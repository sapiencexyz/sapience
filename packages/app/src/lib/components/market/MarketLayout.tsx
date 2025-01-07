'use client';

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

interface MarketLayoutProps {
  nav: ReactNode;
  content: ReactNode;
}

export const MarketLayout = ({ nav, content }: MarketLayoutProps) => {
  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] w-full">
      <Suspense
        fallback={
          <div className="flex justify-center items-center w-full m-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {nav}
        {content}
      </Suspense>
    </div>
  );
};
