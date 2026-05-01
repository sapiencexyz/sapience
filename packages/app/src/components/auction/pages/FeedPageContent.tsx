'use client';

import type React from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import ActivityTable from '~/components/positions/ActivityTable';

const FeedPageContent: React.FC = () => {
  const titleSlot = (
    <h1 className="text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap">
      <ActivityIcon className="h-4 w-4" aria-hidden="true" />
      <span>Activity Feed</span>
    </h1>
  );

  return (
    <div className="mx-auto pb-0 px-3 md:px-6 lg:px-8 w-full pt-4 md:pt-0">
      <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black mb-3 md:mb-6 lg:mb-8">
        <ActivityTable leftSlot={titleSlot} viewportOffset={200} />
      </div>
    </div>
  );
};

export default FeedPageContent;
