'use client';

import TradePoolLayout from '~/components/TradePoolLayout';
import { PeriodProvider } from '~/lib/context/PeriodProvider';

const Market = ({ params }: { params: { id: string; market: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <PeriodProvider
      chainId={Number(chainId)}
      address={marketAddress}
      market={Number(params.market)}
    >
      <TradePoolLayout params={params} isTrade={false} />
    </PeriodProvider>
  );
};

export default Market;
