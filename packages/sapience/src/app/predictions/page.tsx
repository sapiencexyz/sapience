import { Loader2 } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import PredictionsTable from '~/components/predictionsTable';

export const metadata: Metadata = {
  title: 'Predictions',
  description: 'Make predictions across various focus areas',
};

const PredictionsPage = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <PredictionsTable />
      </Suspense>
    </div>
  );
};

export default PredictionsPage;
