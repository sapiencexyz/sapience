'use client';

import { useBannerHeight } from '~/hooks/useBannerHeight';

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
  const bannerRef = useBannerHeight<HTMLAnchorElement>();

  // Only render when LowBalanceBanner is hidden
  if (!showWhenLowBalanceHidden) return null;

  return (
    <a
      ref={bannerRef}
      href="https://discord.gg/sapience"
      target="_blank"
      rel="noopener noreferrer"
      className={`relative w-full z-[9998] bg-accent-gold text-brand-black py-1 leading-none text-center font-mono text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap ${className ?? ''}`}
    >
      <span className="relative z-10">
        <span className="md:hidden">
          Sapience Beta Live: Request Invite in Discord
        </span>
        <span className="hidden md:inline">
          Sapience Beta Now Live: Request an Invite Code in Discord
        </span>
      </span>
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </a>
  );
};

export default BetaBanner;
