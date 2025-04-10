import type { Metadata } from 'next';
import { Suspense } from 'react';

import MarketGroupsList from '~/components/MarketGroupsList';

export const metadata: Metadata = {
  title: 'Forecasting',
  description: 'Make forecasts across various focus areas',
};

const ForecastingPage = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl mt-16">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-8">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        }
      >
        <MarketGroupsList />
      </Suspense>
    </div>
  );
};

export default ForecastingPage;
