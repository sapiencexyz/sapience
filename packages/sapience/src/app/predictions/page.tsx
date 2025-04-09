import { Loader2 } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import MarketGroupsList from '~/components/MarketGroupsList';

export const metadata: Metadata = {
  title: 'Predictions',
  description: 'Make predictions across various focus areas',
};

const PredictionsPage = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl mt-16">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <MarketGroupsList />
      </Suspense>
    </div>
  );
};

export default PredictionsPage;
