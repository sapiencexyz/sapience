import { redirect } from 'next/navigation';

const AuctionPage = () => {
  redirect('/feed#auctions');
};

export default AuctionPage;
