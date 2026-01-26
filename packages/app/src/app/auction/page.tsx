import type { Metadata } from 'next';
import AuctionPageContent from '~/components/auction/pages/AuctionPageContent';

export const metadata: Metadata = {
  title: 'Live Order Flow',
  description: 'Monitor live order flow and market activity',
};

const AuctionPage = () => {
  return (
    <div className="relative min-h-screen">
      <div className="relative">
        <AuctionPageContent />
      </div>
    </div>
  );
};

export default AuctionPage;
