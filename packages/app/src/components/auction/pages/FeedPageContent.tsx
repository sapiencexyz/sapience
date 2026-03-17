'use client';

import type React from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import ActivityTable from '~/components/positions/ActivityTable';

const FeedPageContent: React.FC = () => {
  return (
    <div className="mt-0 md:mt-0.5 px-3 md:px-6 lg:px-8 pr-4 md:pr-6 lg:pr-6 pb-20 sm:pb-24">
      <div className="mx-auto w-full">
        <div className="mt-3 mb-6 lg:mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-medium inline-flex items-center gap-2">
            <ActivityIcon className="h-5 w-5" aria-hidden="true" />
            <span>Activity Feed</span>
          </h1>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
          <ActivityTable />
        </div>
      </div>
    </div>
  );
};

export default FeedPageContent;
