import type { Metadata } from 'next';

import ResourceNav from '~/components/market/ResourceNav';
import ResourceContent from '~/components/resources/ResourceContent';

export const metadata: Metadata = {
  title: 'Gas and Blobspace Prices',
};

const MarketPage = ({ params }: { params: { id: string } }) => {
  return (
    <div className="flex flex-col w-full">
      <ResourceNav />
      <ResourceContent id={params.id} />
    </div>
  );
};

export default MarketPage;
