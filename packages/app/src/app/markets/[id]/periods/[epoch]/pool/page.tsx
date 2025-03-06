'use client';

import AdvancedView from '~/components/AdvancedView';
import { PeriodProvider } from '~/lib/context/PeriodProvider';

const Market = ({ params }: { params: { id: string; epoch: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <PeriodProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(params.epoch)}
    >
      <AdvancedView params={params} isTrade={false} />
    </PeriodProvider>
  );
};

export default Market;
