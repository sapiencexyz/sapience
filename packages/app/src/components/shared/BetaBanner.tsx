'use client';

import { useState } from 'react';
import { useBannerHeight } from '~/hooks/useBannerHeight';
import GetAccessDialog from '~/components/shared/GetAccessDialog';

type BetaBannerProps = {
  className?: string;
  showWhenLowBalanceHidden?: boolean;
};

/**
 * Banner promoting the Sapience beta.
 * Only shows when LowBalanceBanner is not visible (LowBalanceBanner takes priority).
 */
const BetaBanner: React.FC<BetaBannerProps> = ({
  className,
  showWhenLowBalanceHidden = true,
}) => {
  const bannerRef = useBannerHeight<HTMLButtonElement>();
  const [isGetAccessOpen, setIsGetAccessOpen] = useState(false);

  // Only render when LowBalanceBanner is hidden
  if (!showWhenLowBalanceHidden) return null;

  return (
    <>
      <button
        ref={bannerRef}
        type="button"
        onClick={() => setIsGetAccessOpen(true)}
        className={`relative w-full z-[9998] bg-accent-gold text-brand-black py-1 leading-none text-center font-mono text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap ${className ?? ''}`}
      >
        <span className="relative z-10">
          SAPIENCE BETA NOW LIVE: GET EARLY ACCESS
        </span>
        <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
      </button>
      <GetAccessDialog
        open={isGetAccessOpen}
        onOpenChange={setIsGetAccessOpen}
      />
    </>
  );
};

export default BetaBanner;
