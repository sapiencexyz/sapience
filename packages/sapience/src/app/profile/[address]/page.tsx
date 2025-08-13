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
import { usePredictions } from '~/hooks/graphql/usePredictions';
import { SCHEMA_UID } from '~/lib/constants/eas';

const TAB_VALUES = ['forecasts', 'trades', 'lp', 'parlays'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  const { data: positionsData } = usePositions({ address });
  const traderPositions = (positionsData || []).filter((p) => !p.isLP);
  const lpPositions = (positionsData || []).filter((p) => p.isLP);

  const { data: attestations } = usePredictions({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'forecasts' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    return (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('forecasts' as TabValue);
  };

  const [tabValue, setTabValue] = useState<TabValue>('forecasts');

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
      : ('forecasts' as TabValue);
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
          <TabsTrigger value="trades">Prediction Market Trades</TabsTrigger>
          <TabsTrigger value="lp">Prediction Market Liquidity</TabsTrigger>
          <TabsTrigger value="parlays">Parlays</TabsTrigger>
        </TabsList>

        <TabsContent value="forecasts">
          <ForecastsTable attestations={attestations} />
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
