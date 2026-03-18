'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuctionPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/feed#auctions');
  }, [router]);
  return null;
};

export default AuctionPage;
