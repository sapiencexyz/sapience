import type { Metadata } from 'next';
import FeedPageContent from '~/components/auction/pages/FeedPageContent';

export const metadata: Metadata = {
  title: 'Feed',
  description: 'Monitor recent positions and live order flow',
};

const FeedPage = () => {
  return (
    // flex flex-1 + flex-col so the FeedPageContent wrapper can grow
    // through the layout's flex column chain. Without flex here, the
    // page wrapper's flex-1 has nothing concrete to claim.
    <div className="relative flex flex-1 flex-col">
      <FeedPageContent />
    </div>
  );
};

export default FeedPage;
