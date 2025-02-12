import type { Metadata } from 'next';

import Earn from '~/components/earn';

export const metadata: Metadata = {
  title: 'Earn',
};

const EarnPage = ({ params }: { params: { slug: string } }) => {
  return <Earn slug={params.slug} />;
};

export default EarnPage;
