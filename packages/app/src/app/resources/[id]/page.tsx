import type { Metadata } from 'next';

import ResourceLayout from '~/components/market/ResourceLayout';
import ResourceNav from '~/components/market/ResourceNav';
import ResourceContent from '~/components/resources/ResourceContent';

export const metadata: Metadata = {
  title: 'Gas and Blobspace Prices',
};

const MarketPage = ({ params }: { params: { id: string } }) => {
  return (
    <ResourceLayout
      nav={<ResourceNav />}
      content={<ResourceContent id={params.id} />}
    />
  );
};

export default MarketPage;
