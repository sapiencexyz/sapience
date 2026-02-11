import type { Metadata } from 'next';
import FeedPageContent from '~/components/auction/pages/FeedPageContent';

export const metadata: Metadata = {
  title: 'Feed',
  description: 'Monitor recent positions and live order flow',
};

const FeedPage = () => {
  return (
    <div className="relative min-h-screen">
      <div className="relative">
        <FeedPageContent />
      </div>
    </div>
  );
};

export default FeedPage;
