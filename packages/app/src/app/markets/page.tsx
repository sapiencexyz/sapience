import type { Metadata } from 'next';
import PageContainer from '~/components/layout/PageContainer';
import MarketsPageClient from './MarketsPageClient';

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
