'use client';

import React from 'react';

import Earn from '~/lib/components/foil/earn';
import { MarketProvider } from '~/lib/context/MarketProvider';

const EarnPage = ({
  params,
}: {
  params: { id: string; epoch: string };
}) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
    >
        <Earn
          marketAddress={marketAddress}
          chainId={Number(chainId)}
        />
    </MarketProvider>
  );
};

export default EarnPage;
