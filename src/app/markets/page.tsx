import type { Metadata } from 'next';
import MarketsPageClient from './MarketsPageClient';
import PageContainer from '~/components/layout/PageContainer';

export const metadata: Metadata = {
  title: 'Prediction Markets',
  description: 'Browse prediction markets across various focus areas',
};

const ForecastingPage = () => {
  return (
    <PageContainer>
      <MarketsPageClient />
    </PageContainer>
  );
};

export default ForecastingPage;
