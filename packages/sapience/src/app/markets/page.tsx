import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { NetworkSwitcher } from '~/components/shared/NetworkSwitcher';

const MarketGroupsListSkeleton = () => <div className="space-y-4" />;

// Dynamically import MarketGroupsList
const MarketGroupsList = dynamic(
  () => import('~/components/forecasting/MarketGroupsList'),
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
    <div className="container mx-auto px-4 md:p-8 max-w-8xl mt-16">
      <NetworkSwitcher />
      <MarketGroupsList />
    </div>
  );
};

export default ForecastingPage;
