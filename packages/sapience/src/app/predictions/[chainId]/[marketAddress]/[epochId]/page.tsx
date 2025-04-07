'use client';

import { useParams } from 'next/navigation';

const PredictionDetailPage = () => {
  const params = useParams();

  const { chainId, marketAddress, epochId } = params;

  // TODO: Fetch actual prediction data based on params

  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Prediction Details</h1>
      <div className="bg-card p-6 rounded-lg shadow-sm border">
        <p className="mb-2">
          <span className="font-semibold">Chain ID:</span> {chainId}
        </p>
        <p className="mb-2">
          <span className="font-semibold">Market Address:</span> {marketAddress}
        </p>
        <p className="mb-4">
          <span className="font-semibold">Epoch ID:</span> {epochId}
        </p>
        <p className="text-muted-foreground italic">
          (Placeholder - Prediction data will be loaded here)
        </p>
      </div>
    </div>
  );
};

export default PredictionDetailPage;
