import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

import MarketGroupsList from '~/components/MarketGroupsList';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

export const metadata: Metadata = {
  title: 'Forecasting',
  description: 'Make forecasts across various focus areas',
};

const ForecastingPage = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl mt-16">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-8 min-h-[calc(100vh-theme(spacing.20))] w-full">
            {/* <p className="text-muted-foreground">Loading...</p> */}
            <LottieLoader width={32} height={32} />
          </div>
        }
      >
        <MarketGroupsList />
      </Suspense>
    </div>
  );
};

export default ForecastingPage;
