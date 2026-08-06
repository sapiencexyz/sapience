'use client';

import type React from 'react';
import ActivityTable from '~/components/positions/ActivityTable';

const FeedPageContent: React.FC = () => {
  return (
    // flex-1 + flex-col so the bordered table container can grow to
    // fill the column. The layout root reserves space for the fixed
    // footer (sm:pb-[33px]), so flex-1 here cleanly stops above it.
    <div className="mx-auto px-3 md:px-6 lg:px-8 w-full pt-4 md:pt-0 flex-1 flex flex-col">
      <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black mb-3 md:mb-6 lg:mb-8 flex-1 flex flex-col">
        {/* The primary feed opts into live "new activity" polling. */}
        <ActivityTable fill enableLive />
      </div>
    </div>
  );
};

export default FeedPageContent;
