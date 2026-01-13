'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import Link from 'next/link';
import { Telescope, ArrowLeftRightIcon } from 'lucide-react';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import ProfileHeader from '~/components/profile/ProfileHeader';
import ForecastsTable from '~/components/profile/ForecastsTable';
import PositionsTable from '~/components/positions/PositionsTable';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import { SCHEMA_UID } from '~/lib/constants';
import Loader from '~/components/shared/Loader';
import EmptyProfileState from '~/components/profile/EmptyProfileState';
import EmptyTabState from '~/components/shared/EmptyTabState';
import ProfileQuickMetrics from '~/components/profile/ProfileQuickMetrics';
import ShareAfterRedirect from '~/components/shared/ShareAfterRedirect';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

const TAB_VALUES = ['positions', 'forecasts'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const ProfilePageContent = () => {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;
  const chainId = useChainIdFromLocalStorage();

  const { data: attestations, isLoading: forecastsLoading } = useForecasts({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  // Positions for this profile address, filtered by chainId
  const { data: positions, isLoading: positionsLoading } = useUserParlays({
    address: String(address),
    chainId,
  });

  const allLoaded = !forecastsLoading && !positionsLoading;

  const hasForecasts = (attestations?.length || 0) > 0;
  const hasPositions = (positions?.length || 0) > 0;

  const shouldShowForecastsTab = hasForecasts;
  const shouldShowPositionsTab = hasPositions;

  // Count visible tabs to determine if we should show the tab switcher
  const visibleTabsCount = [
    shouldShowPositionsTab,
    shouldShowForecastsTab,
  ].filter(Boolean).length;
  const shouldShowTabSwitcher = visibleTabsCount > 1;

  const tabHasContent = useCallback(
    (tab: TabValue): boolean => {
      if (tab === 'positions') return shouldShowPositionsTab;
      if (tab === 'forecasts') return shouldShowForecastsTab;
      return false;
    },
    [shouldShowPositionsTab, shouldShowForecastsTab]
  );

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

  const handleTabChange = useCallback(
    (value: string) => {
      const nextValue = (TAB_VALUES as readonly string[]).includes(value)
        ? (value as TabValue)
        : ('positions' as TabValue);
      // Prevent navigating to hidden tabs
      if (
        (nextValue === 'positions' && !shouldShowPositionsTab) ||
        (nextValue === 'forecasts' && !shouldShowForecastsTab)
      ) {
        const firstWithContent: TabValue | null = shouldShowPositionsTab
          ? 'positions'
          : shouldShowForecastsTab
            ? 'forecasts'
            : null;
        const fallback = firstWithContent ?? ('positions' as TabValue);
        setTabValue(fallback);
        if (typeof window !== 'undefined') {
          const url = `${window.location.pathname}${window.location.search}#${fallback}`;
          window.history.replaceState(null, '', url);
        }
        return;
      }

      setTabValue(nextValue);
      if (typeof window !== 'undefined') {
        const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
        window.history.replaceState(null, '', url);
      }
    },
    [shouldShowPositionsTab, shouldShowForecastsTab]
  );

  const didAutoRedirectRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedOnce || didAutoRedirectRef.current) return;

    const rawHash =
      typeof window !== 'undefined'
        ? window.location.hash?.replace('#', '').toLowerCase()
        : '';
    const hasExplicitHash = (TAB_VALUES as readonly string[]).includes(rawHash);
    if (hasExplicitHash) {
      const hashTab = rawHash as TabValue;
      if (tabHasContent(hashTab)) {
        didAutoRedirectRef.current = true;
        return;
      }
      // fall through to redirect if explicit hash lacks content
    }

    // If current tab already has content, do nothing further
    if (tabHasContent(tabValue)) {
      didAutoRedirectRef.current = true;
      return;
    }

    const firstWithContent: TabValue | null = shouldShowPositionsTab
      ? 'positions'
      : shouldShowForecastsTab
        ? 'forecasts'
        : null;

    if (firstWithContent && tabValue !== firstWithContent) {
      handleTabChange(firstWithContent);
    }
    // Mark as done to avoid overriding user interactions later
    didAutoRedirectRef.current = true;
  }, [
    hasLoadedOnce,
    shouldShowPositionsTab,
    shouldShowForecastsTab,
    tabValue,
    handleTabChange,
    tabHasContent,
  ]);

  return (
    <div className="mx-auto pb-0 px-3 md:px-6 lg:px-8 w-full min-h-screen flex flex-col">
      <ShareAfterRedirect address={address} />
      <div className="mb-6">
        <ProfileHeader address={address} className="mb-0" />
      </div>

      <div className="mb-5">
        {hasLoadedOnce ? (
          <ProfileQuickMetrics
            address={address}
            forecastsCount={attestations?.length ?? 0}
            positions={positions ?? []}
          />
        ) : null}
      </div>

      {hasLoadedOnce ? (
        !(shouldShowPositionsTab || shouldShowForecastsTab) ? (
          <EmptyProfileState />
        ) : (
          <div className="pb-0 flex-1 flex flex-col">
            <Tabs
              value={tabValue}
              onValueChange={handleTabChange}
              className="w-full flex-1 flex flex-col"
            >
              {shouldShowTabSwitcher ? (
                <div className="mb-3">
                  <SegmentedTabsList>
                    {shouldShowPositionsTab ? (
                      <TabsTrigger className="justify-center" value="positions">
                        <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                        Positions
                      </TabsTrigger>
                    ) : null}
                    {shouldShowForecastsTab ? (
                      <TabsTrigger className="justify-center" value="forecasts">
                        <Telescope className="h-4 w-4 mr-2" />
                        Forecasts
                      </TabsTrigger>
                    ) : null}
                  </SegmentedTabsList>
                </div>
              ) : null}

              <div className="-mx-3 md:-mx-6 lg:-mx-8 bg-brand-black flex-1">
                {shouldShowPositionsTab ? (
                  <TabsContent
                    value="positions"
                    className="mt-0 flex-1 flex flex-col"
                  >
                    {hasPositions ? (
                      <PositionsTable
                        account={address}
                        showHeaderText={false}
                        chainId={chainId}
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center border-t border-border">
                        <EmptyTabState centered message="No positions found" />
                      </div>
                    )}
                  </TabsContent>
                ) : null}

                {shouldShowForecastsTab ? (
                  <TabsContent
                    value="forecasts"
                    className="mt-0 flex-1 flex flex-col"
                  >
                    {hasForecasts ? (
                      <ForecastsTable attestations={attestations} />
                    ) : (
                      <div className="flex-1 flex items-center justify-center border-t border-border">
                        <EmptyTabState
                          centered
                          message={
                            <span>
                              No{' '}
                              <Link href="/forecasts" className="underline">
                                forecasts
                              </Link>{' '}
                              found
                            </span>
                          }
                        />
                      </div>
                    )}
                  </TabsContent>
                ) : null}
              </div>
            </Tabs>
          </div>
        )
      ) : (
        <div className="flex justify-center py-24">
          <Loader />
        </div>
      )}
    </div>
  );
};

export default ProfilePageContent;
