import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

const MarketGroupsListSkeleton = () => <div className="space-y-4" />;

// Dynamically import MarketGroupsList
const MarketGroupsList = dynamic(
  () => import('~/components/MarketGroupsList'),
  {
    ssr: false, // Disable server-side rendering
    loading: () => <MarketGroupsListSkeleton />, // Show skeleton while loading
  }
);

export const metadata: Metadata = {
  title: 'Forecasting',
  description: 'Make forecasts across various focus areas',
};

const ForecastingPage = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl mt-16">
      <MarketGroupsList />
    </div>
  );
};

export default ForecastingPage;
