'use client';

import { useState, useEffect } from 'react';
import BetaBanner from './BetaBanner';
import LowBalanceBanner from './LowBalanceBanner';

/**
 * Coordinates banner visibility and height tracking.
 * LowBalanceBanner takes priority over BetaBanner.
 */
const BannerCoordinator = () => {
  const [isLowBalanceVisible, setIsLowBalanceVisible] = useState(false);

  // Initialize CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty('--banner-height', '0px');
  }, []);

  return (
    <>
      <LowBalanceBanner
        onVisibilityChange={(isVisible) => setIsLowBalanceVisible(isVisible)}
      />
      <BetaBanner showWhenLowBalanceHidden={!isLowBalanceVisible} />
    </>
  );
};

export default BannerCoordinator;
