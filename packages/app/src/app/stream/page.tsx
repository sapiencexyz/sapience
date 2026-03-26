import type { Metadata } from 'next';
import PageContainer from '~/components/layout/PageContainer';
import StreamReview from '~/components/stream/StreamReview';

export const metadata: Metadata = {
  title: 'Stream',
  description: 'Real-time relayer and P2P message flow',
  robots: { index: false },
};

const StreamPage = () => {
  return (
    <PageContainer className="pb-4 md:pb-8">
      <StreamReview />
    </PageContainer>
  );
};

export default StreamPage;
