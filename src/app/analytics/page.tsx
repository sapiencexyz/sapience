import type { Metadata } from 'next';
import AnalyticsPageContent from '~/components/analytics/pages/AnalyticsPageContent';

export const metadata: Metadata = {
  title: 'Protocol Analytics',
  description: 'Protocol analytics and performance metrics',
};

function AnalyticsPage(): React.ReactElement {
  return <AnalyticsPageContent />;
}

export default AnalyticsPage;
