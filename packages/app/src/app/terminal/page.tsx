import type { Metadata } from 'next';
import TerminalPageContent from '~/components/terminal/pages/TerminalPageContent';
import PageContainer from '~/components/layout/PageContainer';

export const metadata: Metadata = {
  title: 'Trading Terminal',
  description: 'Bid on prediction markets in real-time',
};

const TerminalPage = () => {
  return (
    <PageContainer className="pb-4 md:pb-8">
      <TerminalPageContent />
    </PageContainer>
  );
};

export default TerminalPage;
