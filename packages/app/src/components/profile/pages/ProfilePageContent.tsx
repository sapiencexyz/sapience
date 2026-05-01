'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import { Telescope, ArrowLeftRightIcon, Activity } from 'lucide-react';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import ProfileHeader from '~/components/profile/ProfileHeader';
import ForecastsTable from '~/components/profile/ForecastsTable';
import PositionsTable from '~/components/positions/PositionsTable';
import ActivityTable from '~/components/positions/ActivityTable';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants';
import ProfileQuickMetrics from '~/components/profile/ProfileQuickMetrics';
import ShareAfterRedirect from '~/components/shared/ShareAfterRedirect';

const TAB_VALUES = ['positions', 'forecasts', 'activity'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const ProfilePageContent = ({
  addressOverride,
}: {
  addressOverride?: string;
}) => {
  const params = useParams();
  const address = (
    addressOverride || (params.address as string)
  ).toLowerCase() as Address;

  const { data: attestations, isLoading: forecastsLoading } = useForecasts({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  const allLoaded = !forecastsLoading;

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (allLoaded && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [allLoaded, hasLoadedOnce]);

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'positions' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('positions' as TabValue);
    return desired;
  };

  const [tabValue, setTabValue] = useState<TabValue>('positions');

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

  const handleTabChange = useCallback((value: string) => {
    const nextValue = (TAB_VALUES as readonly string[]).includes(value)
      ? (value as TabValue)
      : ('positions' as TabValue);

    setTabValue(nextValue);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
      window.history.replaceState(null, '', url);
    }
  }, []);

  const tabSwitcher = (
    <SegmentedTabsList className="w-full md:w-auto">
      <TabsTrigger
        className="justify-center flex-1 md:flex-none"
        value="positions"
      >
        <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
        Positions
      </TabsTrigger>
      <TabsTrigger
        className="justify-center flex-1 md:flex-none"
        value="forecasts"
      >
        <Telescope className="h-4 w-4 mr-2" />
        Forecasts
      </TabsTrigger>
      <TabsTrigger
        className="justify-center flex-1 md:flex-none"
        value="activity"
      >
        <Activity className="h-4 w-4 mr-2" />
        Activity
      </TabsTrigger>
    </SegmentedTabsList>
  );

  return (
    // flex-1 + flex-col so the tabs region can grow to fill the column
    // (ContentArea is itself a flex column under the layout root).
    <div className="mx-auto pb-3 md:pb-6 lg:pb-8 px-3 md:px-6 lg:px-8 w-full pt-4 md:pt-0 flex-1 flex flex-col">
      <ShareAfterRedirect address={address} />
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <ProfileHeader address={address} className="mb-0" />
        {hasLoadedOnce ? (
          <ProfileQuickMetrics
            address={address}
            forecastsCount={attestations?.length ?? 0}
            positions={[]}
          />
        ) : null}
      </div>

      <div className="pb-0 flex-1 flex flex-col">
        <Tabs
          value={tabValue}
          onValueChange={handleTabChange}
          className="w-full flex-1 flex flex-col"
        >
          <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black mb-3 md:mb-6 lg:mb-8 flex-1 flex flex-col">
            {/*
              `data-[state=active]:` modifier on the flex utilities is
              load-bearing: without it, inactive TabsContent panels still
              compute as `display: flex` (the class beats the UA
              `[hidden] { display: none }` rule on equal specificity), so
              all three panels share the bordered container's height via
              flex-1 and the active one only claims a third. Gating the
              flex utilities on `data-state=active` lets the [hidden]
              attribute fully hide inactive panels.
            */}
            <TabsContent
              value="positions"
              className="mt-0 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <PositionsTable
                account={address}
                showHeaderText={false}
                leftSlot={tabSwitcher}
                fill
              />
            </TabsContent>

            <TabsContent
              value="forecasts"
              className="mt-0 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ForecastsTable
                attesterAddress={address}
                leftSlot={tabSwitcher}
                fill
              />
            </TabsContent>

            <TabsContent
              value="activity"
              className="mt-0 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ActivityTable account={address} leftSlot={tabSwitcher} fill />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ProfilePageContent;
