'use client';

import Earn from '~/components/earn';
import { PeriodProvider } from '~/lib/context/PeriodProvider';

const EarnPage = ({ params }: { params: { id: string; epoch: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <PeriodProvider chainId={Number(chainId)} address={marketAddress}>
      <Earn />
    </PeriodProvider>
  );
};

export default EarnPage;
