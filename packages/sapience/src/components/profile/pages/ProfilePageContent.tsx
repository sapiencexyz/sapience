'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';

import {
  Telescope,
  SquareStackIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import ProfileHeader from '~/components/profile/ProfileHeader';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import ClosedTraderPositionsTable from '~/components/profile/ClosedTraderPositionsTable';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import ForecastsTable from '~/components/profile/ForecastsTable';
import UserParlaysTable from '~/components/parlays/UserParlaysTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import { SCHEMA_UID } from '~/lib/constants/eas';
import LottieLoader from '~/components/shared/LottieLoader';
import EmptyProfileState from '~/components/profile/EmptyProfileState';
import ProfileStats from '~/components/profile/ProfileStats';
import ProfileQuickMetrics from '~/components/profile/ProfileQuickMetrics';

const TAB_VALUES = ['trades', 'parlays', 'lp', 'forecasts'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const ProfilePageContent = () => {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  // Remove parlay feature flag; Parlays tab is always available

  const {
    data: positionsData,
    isLoading: positionsLoading,
    isFetching: positionsFetching,
  } = usePositions({
    address,
  });
  const traderPositions = (positionsData || []).filter((p) => !p.isLP);
  const traderPositionsOpen = traderPositions.filter((p) => {
    try {
      const collateralStr = p.collateral ?? '0';
      const hasCollateral = BigInt(collateralStr) > 0n;
      return hasCollateral && !p.isSettled;
    } catch {
      return !p.isSettled;
    }
  });
  const traderPositionsClosed = traderPositions.filter((p) => {
    try {
      const collateralStr = p.collateral ?? '0';
      const hasCollateral = BigInt(collateralStr) > 0n;
      return !hasCollateral || !!p.isSettled;
    } catch {
      return !!p.isSettled;
    }
  });
  const lpPositions = (positionsData || []).filter((p) => p.isLP);

  const { data: attestations, isLoading: forecastsLoading } = useForecasts({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  // Parlays for this profile address
  const { data: parlays, isLoading: parlaysLoading } = useUserParlays({
    address: String(address),
  });

  const allLoaded =
    !positionsLoading &&
    !forecastsLoading &&
    !positionsFetching &&
    !parlaysLoading;

  const hasTrades = traderPositions.length > 0;
  const hasLp = lpPositions.length > 0;
  const hasForecasts = (attestations?.length || 0) > 0;
  const hasParlays = (parlays?.length || 0) > 0;

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (allLoaded && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [allLoaded, hasLoadedOnce]);

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'trades' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('trades' as TabValue);
    return desired;
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

  const didAutoRedirectRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedOnce || didAutoRedirectRef.current) return;

    const rawHash =
      typeof window !== 'undefined'
        ? window.location.hash?.replace('#', '').toLowerCase()
        : '';
    const hasExplicitHash = (TAB_VALUES as readonly string[]).includes(rawHash);
    if (hasExplicitHash) {
      didAutoRedirectRef.current = true;
      return;
    }

    const tabHasContent = (tab: TabValue): boolean => {
      if (tab === 'trades') return hasTrades;
      if (tab === 'parlays') return hasParlays;
      if (tab === 'lp') return hasLp;
      if (tab === 'forecasts') return hasForecasts;
      return false;
    };

    // If current tab already has content, do nothing further
    if (tabHasContent(tabValue)) {
      didAutoRedirectRef.current = true;
      return;
    }

    const firstWithContent: TabValue | null = hasTrades
      ? 'trades'
      : hasParlays
        ? 'parlays'
        : hasLp
          ? 'lp'
          : hasForecasts
            ? 'forecasts'
            : null;

    if (firstWithContent && tabValue !== firstWithContent) {
      handleTabChange(firstWithContent);
    }
    // Mark as done to avoid overriding user interactions later
    didAutoRedirectRef.current = true;
  }, [hasLoadedOnce, hasTrades, hasLp, hasForecasts]);

  // No feature flag; nothing to monitor

  return (
    <div className="container max-w-6xl mx-auto py-24 lg:py-32 px-4">
      <div className="mb-5 lg:mb-10">
        <ProfileHeader address={address} />
      </div>

      <div className="mb-5">
        {hasLoadedOnce ? (
          <ProfileQuickMetrics
            address={address}
            forecastsCount={attestations?.length ?? 0}
            positions={positionsData ?? []}
            parlays={parlays ?? []}
          />
        ) : null}
      </div>

      <div className="mb-5">
        <ProfileStats address={address} />
      </div>

      {hasLoadedOnce ? (
        !(hasTrades || hasParlays || hasLp || hasForecasts) ? (
          <EmptyProfileState />
        ) : (
          <Tabs
            value={tabValue}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-1 lg:grid-cols-4 h-auto gap-2 mb-5">
              <TabsTrigger className="w-full" value="trades">
                <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                Trades
              </TabsTrigger>
              <TabsTrigger className="w-full" value="parlays">
                <SquareStackIcon className="h-4 w-4 mr-2" />
                Parlays
              </TabsTrigger>
              <TabsTrigger className="w-full" value="lp">
                <DropletsIcon className="h-4 w-4 mr-2" />
                Liquidity
              </TabsTrigger>
              <TabsTrigger className="w-full" value="forecasts">
                <Telescope className="h-4 w-4 mr-2" />
                Forecasts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trades">
              {traderPositionsOpen.length > 0 ? (
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    Active
                  </h3>
                  <TraderPositionsTable
                    positions={traderPositionsOpen}
                    context="profile"
                  />
                </div>
              ) : null}
              {traderPositionsClosed.length > 0 ? (
                <div className="mt-6">
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    Closed
                  </h3>
                  <ClosedTraderPositionsTable
                    positions={traderPositionsClosed}
                  />
                </div>
              ) : null}
              {traderPositionsOpen.length === 0 &&
              traderPositionsClosed.length === 0 ? (
                <EmptyProfileState />
              ) : null}
            </TabsContent>

            <TabsContent value="parlays">
              <UserParlaysTable account={address} showHeaderText={false} />
            </TabsContent>

            <TabsContent value="lp">
              <LpPositionsTable positions={lpPositions} context="profile" />
            </TabsContent>

            <TabsContent value="forecasts">
              <ForecastsTable attestations={attestations} />
            </TabsContent>
          </Tabs>
        )
      ) : (
        <div className="flex justify-center py-24">
          <LottieLoader width={32} height={32} />
        </div>
      )}
    </div>
  );
};

export default ProfilePageContent;
