'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { STARGATE_DEPOSIT_URL } from '~/lib/constants';
import { useBannerHeight } from '~/hooks/useBannerHeight';

type LowBalanceBannerProps = {
  className?: string;
  onVisibilityChange?: (isVisible: boolean) => void;
};

/**
 * Banner displayed when the user's collateral balance is zero or negative.
 * Takes priority over BetaBanner.
 */
const LowBalanceBanner: React.FC<LowBalanceBannerProps> = ({
  className,
  onVisibilityChange,
}) => {
  const { address, isConnected } = useAccount();
  const chainId = DEFAULT_CHAIN_ID;
  const { balance, isLoading } = useCollateralBalance({
    address,
    chainId,
    enabled: isConnected && !!address,
  });
  const [mounted, setMounted] = useState(false);
  const bannerRef = useBannerHeight<HTMLAnchorElement>();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLowBalance = isConnected && balance <= 0;
  const isVisible = mounted && isConnected && !isLoading && isLowBalance;

  // Notify parent of visibility changes
  useEffect(() => {
    if (mounted) {
      onVisibilityChange?.(isVisible);
    }
  }, [isVisible, mounted, onVisibilityChange]);

  // Don't show if not connected, still loading, or balance is fine
  if (!isConnected || isLoading || !isLowBalance) return null;

  // Don't render on server or before hydration
  if (!mounted) return null;

  return (
    <a
      ref={bannerRef}
      href={STARGATE_DEPOSIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative z-[9999] bg-ethena text-brand-black py-1 leading-none text-center font-mono text-xs font-semibold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap w-full ${className ?? ''}`}
    >
      <span className="relative z-10">
        Deposit Ethereal USDe to get started
      </span>
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </a>
  );
};

export default LowBalanceBanner;
