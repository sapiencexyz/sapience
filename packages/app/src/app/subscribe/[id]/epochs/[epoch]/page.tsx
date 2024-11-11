'use client';

import React from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { MarketProvider } from '~/lib/context/MarketProvider';

const SubscribePage = ({
  params,
}: {
  params: { id: string; epoch: string };
}) => {
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <div className="flex-1 flex p-6">
        <div className="m-auto border border-border rounded-md p-6 max-w-[460px]">
          <Subscribe
            marketAddress={marketAddress}
            chainId={Number(chainId)}
            epoch={Number(epoch)}
            showMarketSwitcher={false}
          />
        </div>
      </div>
    </MarketProvider>
  );
};

export default SubscribePage;
