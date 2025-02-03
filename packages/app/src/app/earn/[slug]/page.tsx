'use client';

import Earn from '~/components/earn';

const EarnPage = ({ params }: { params: { slug: string } }) => {
  return <Earn slug={params.slug} />;
};

export default EarnPage;
