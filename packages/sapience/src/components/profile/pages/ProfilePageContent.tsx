'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import Link from 'next/link';
import { Telescope, ArrowLeftRightIcon, DropletsIcon } from 'lucide-react';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
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
import EmptyTabState from '~/components/shared/EmptyTabState';
import ProfileQuickMetrics from '~/components/profile/ProfileQuickMetrics';
import ShareAfterRedirect from '~/components/shared/ShareAfterRedirect';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { CHAIN_ID_ETHEREAL } from '~/components/admin/constants';

const TAB_VALUES = ['parlays', 'trades', 'lp', 'forecasts'] as const;
type TabValue = (typeof TAB_VALUES)[number];

// (removed segmented tab background helper)

const ProfilePageContent = () => {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;
  const chainId = useChainIdFromLocalStorage();
  const isEtherealChain = chainId === CHAIN_ID_ETHEREAL;

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

  // Parlays for this profile address, filtered by chainId
  const { data: parlays, isLoading: parlaysLoading } = useUserParlays({
    address: String(address),
    chainId,
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

  // On Ethereal chain, only show parlays; otherwise show all tabs
  const shouldShowTradesTab = !isEtherealChain && hasTrades;
  const shouldShowLpTab = !isEtherealChain && hasLp;
  const shouldShowForecastsTab = !isEtherealChain && hasForecasts;
  const shouldShowParlaysTab = hasParlays;

  // Count visible tabs to determine if we should show the tab switcher
  const visibleTabsCount = [
    shouldShowParlaysTab,
    shouldShowTradesTab,
    shouldShowLpTab,
    shouldShowForecastsTab,
  ].filter(Boolean).length;
  const shouldShowTabSwitcher = visibleTabsCount > 1;

  const tabHasContent = useCallback(
    (tab: TabValue): boolean => {
      if (tab === 'trades') return shouldShowTradesTab;
      if (tab === 'parlays') return shouldShowParlaysTab;
      if (tab === 'lp') return shouldShowLpTab;
      if (tab === 'forecasts') return shouldShowForecastsTab;
      return false;
    },
    [
      shouldShowTradesTab,
      shouldShowParlaysTab,
      shouldShowLpTab,
      shouldShowForecastsTab,
    ]
  );

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (allLoaded && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [allLoaded, hasLoadedOnce]);

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'parlays' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('parlays' as TabValue);
    return desired;
  };

  const [tabValue, setTabValue] = useState<TabValue>('parlays');

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
        : ('parlays' as TabValue);
      // Prevent navigating to hidden tabs
      if (
        (nextValue === 'parlays' && !shouldShowParlaysTab) ||
        (nextValue === 'trades' && !shouldShowTradesTab) ||
        (nextValue === 'lp' && !shouldShowLpTab) ||
        (nextValue === 'forecasts' && !shouldShowForecastsTab)
      ) {
        const firstWithContent: TabValue | null = shouldShowParlaysTab
          ? 'parlays'
          : shouldShowTradesTab
            ? 'trades'
            : shouldShowLpTab
              ? 'lp'
              : shouldShowForecastsTab
                ? 'forecasts'
                : null;
        const fallback = firstWithContent ?? ('parlays' as TabValue);
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
    [
      shouldShowParlaysTab,
      shouldShowTradesTab,
      shouldShowLpTab,
      shouldShowForecastsTab,
    ]
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

    const firstWithContent: TabValue | null = shouldShowParlaysTab
      ? 'parlays'
      : shouldShowTradesTab
        ? 'trades'
        : shouldShowLpTab
          ? 'lp'
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
    shouldShowParlaysTab,
    shouldShowTradesTab,
    shouldShowLpTab,
    shouldShowForecastsTab,
    tabValue,
    handleTabChange,
    tabHasContent,
  ]);

  return (
    <div className="mx-auto pt-24 lg:pt-24 pb-0 px-3 md:px-6 lg:px-8 w-full min-h-screen flex flex-col">
      <ShareAfterRedirect address={address} />
      <div className="mb-6">
        <ProfileHeader address={address} className="mb-0" />
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

      {hasLoadedOnce ? (
        !(
          shouldShowParlaysTab ||
          shouldShowTradesTab ||
          shouldShowLpTab ||
          shouldShowForecastsTab
        ) ? (
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
                    {shouldShowParlaysTab ? (
                      <TabsTrigger className="justify-center" value="parlays">
                        <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                        Trades
                      </TabsTrigger>
                    ) : null}
                    {shouldShowTradesTab ? (
                      <TabsTrigger className="justify-center" value="trades">
                        <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                        Spot Trades
                      </TabsTrigger>
                    ) : null}
                    {shouldShowLpTab ? (
                      <TabsTrigger className="justify-center" value="lp">
                        <DropletsIcon className="h-4 w-4 mr-2" />
                        Spot Liquidity
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
                {shouldShowParlaysTab ? (
                  <TabsContent
                    value="parlays"
                    className="mt-0 flex-1 flex flex-col"
                  >
                    {hasParlays ? (
                      <UserParlaysTable
                        account={address}
                        showHeaderText={false}
                        chainId={chainId}
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center border-t border-border">
                        <EmptyTabState centered message="No parlays found" />
                      </div>
                    )}
                  </TabsContent>
                ) : null}

                {shouldShowTradesTab ? (
                  <TabsContent
                    value="trades"
                    className="mt-0 flex-1 flex flex-col"
                  >
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
                      <div className="flex-1 flex items-center justify-center border-t border-border">
                        <EmptyTabState centered message="No trades found" />
                      </div>
                    ) : null}
                  </TabsContent>
                ) : null}

                {shouldShowLpTab ? (
                  <TabsContent value="lp" className="mt-0 flex-1 flex flex-col">
                    {hasLp ? (
                      <LpPositionsTable
                        positions={lpPositions}
                        context="profile"
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center border-t border-border">
                        <EmptyTabState
                          centered
                          message="No liquidity positions found"
                        />
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
                              <Link href="/forecast" className="underline">
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
          <LottieLoader />
        </div>
      )}
    </div>
  );
};

export default ProfilePageContent;
