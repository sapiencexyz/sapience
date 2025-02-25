import type { Metadata } from 'next';

import ResourceContent from '~/components/resources/ResourceContent';

export const metadata: Metadata = {
  title: 'Gas and Blobspace Prices',
};

// This is a server component that receives the ID parameter
const MarketPage = ({ params }: { params: { id: string } }) => {
  return <ResourceContent id={params.id} />;
};

export default MarketPage;
