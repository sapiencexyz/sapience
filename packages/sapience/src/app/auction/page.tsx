'use client';

import AuctionPageContent from '~/components/auction/pages/AuctionPageContent';
import SplineTopBackground from '~/components/shared/SplineTopBackground';

const AuctionPage = () => {
  return (
    <div className="relative min-h-screen">
      <SplineTopBackground />
      <div className="relative">
        <AuctionPageContent />
      </div>
    </div>
  );
};

export default AuctionPage;
