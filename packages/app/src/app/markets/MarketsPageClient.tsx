'use client';

import dynamic from 'next/dynamic';

const MarketsPageSkeleton = () => <div className="space-y-4" />;

const MarketsPage = dynamic(() => import('~/components/markets/MarketsPage'), {
  ssr: false,
  loading: () => <MarketsPageSkeleton />,
});

export default function MarketsPageClient() {
  return <MarketsPage />;
}
