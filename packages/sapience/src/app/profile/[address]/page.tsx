'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';

import ProfileHeader from '~/components/profile/ProfileHeader';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import ForecastsTable from '~/components/profile/ForecastsTable';
import UserParlaysTable from '~/components/parlays/UserParlaysTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants/eas';

const TAB_VALUES = ['forecasts', 'trades', 'lp', 'parlays'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  const { data: positionsData } = usePositions({ address });
  const traderPositions = (positionsData || []).filter((p) => !p.isLP);
  const lpPositions = (positionsData || []).filter((p) => p.isLP);

  const { data: attestations } = useForecasts({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'trades' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    return (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('trades' as TabValue);
  };

  const [tabValue, setTabValue] = useState<TabValue>('trades');

  useEffect(() => {
    setTabValue(getHashValue());
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setTabValue(getHashValue());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    };
  }, []);

  const handleTabChange = (value: string) => {
    const nextValue = (TAB_VALUES as readonly string[]).includes(value)
      ? (value as TabValue)
      : ('trades' as TabValue);
    setTabValue(nextValue);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <div className="mb-12">
        <ProfileHeader address={address} />
      </div>

      <Tabs value={tabValue} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 h-auto gap-2 mb-4">
          <TabsTrigger className="w-full" value="trades">
            Prediction Market Trades
          </TabsTrigger>
          <TabsTrigger className="w-full" value="lp">
            Prediction Market Liquidity
          </TabsTrigger>
          <TabsTrigger className="w-full" value="parlays">
            Parlays
          </TabsTrigger>
          <TabsTrigger className="w-full" value="forecasts">
            Forecasts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trades">
          <TraderPositionsTable
            positions={traderPositions}
            showHeader={false}
          />
        </TabsContent>

        <TabsContent value="lp">
          <LpPositionsTable positions={lpPositions} showHeader={false} />
        </TabsContent>

        <TabsContent value="parlays">
          <UserParlaysTable account={address} showHeaderText={false} />
        </TabsContent>

        <TabsContent value="forecasts">
          <ForecastsTable attestations={attestations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
