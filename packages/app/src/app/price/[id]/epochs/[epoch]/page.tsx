'use client';

import React from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import TradingViewWidget from '~/lib/components/foil/TradingViewWidget';
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
      <div className="flex-1 flex p-6 border border-border overflow-hidden rounded shadow-sm">
        <TradingViewWidget />
      </div>
    </MarketProvider>
  );
};

export default SubscribePage;
