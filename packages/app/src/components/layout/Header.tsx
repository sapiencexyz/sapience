'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sapience/ui/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@sapience/ui/components/ui/sidebar';
import {
  LogOut,
  Menu,
  User,
  BookOpen,
  Settings,
  ChevronDown,
  Telescope,
  Bot,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  XCircle,
  BarChart3,
  Activity,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SiSubstack } from 'react-icons/si';

import { useEffect, useRef, useState } from 'react';
import { useDisconnect } from 'wagmi';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import CollateralBalanceButton from './CollateralBalanceButton';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import EnsAvatar from '~/components/shared/EnsAvatar';
import GetAccessDialog from '~/components/shared/GetAccessDialog';
import ReferralsDialog from '~/components/shared/ReferralsDialog';
import RequiredReferralCodeDialog from '~/components/shared/RequiredReferralCodeDialog';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useAuth } from '~/lib/context/AuthContext';
import { useSession } from '~/lib/context/SessionContext';
import {
  useSettings,
  DEFAULT_CONNECTION_DURATION_HOURS,
} from '~/lib/context/SettingsContext';
import { StatusIndicators } from '~/components/layout/StatusIndicators';

const USER_REFERRAL_STATUS_QUERY = `
  query UserReferralStatus($wallet: String!) {
    user(where: { address: $wallet }) {
      address
      refCodeHash
      referredBy {
        id
      }
      referredByCode {
        id
      }
    }
  }
`;

const isActive = (path: string, pathname: string) => {
  if (path === '/') {
    return pathname === path;
  }
  return pathname.startsWith(path);
};

interface NavLinksProps {
  onClose?: () => void;
}

const NavLinks = ({ onClose }: NavLinksProps) => {
  const pathname = usePathname();
  const { ready, hasConnectedWallet, connectedWallet } = useConnectedWallet();
  const { setOpenMobile, isMobile } = useSidebar();
  const { effectiveAddress } = useSession();
  const linkClass = 'sc-heading justify-start rounded-full';
  const activeClass = 'text-accent-gold';

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {ready && hasConnectedWallet && connectedWallet && (
        <CollateralBalanceButton className="xl:hidden mt-10 ml-4" />
      )}
      <nav
        className={`flex flex-col gap-3 w-full ${ready && hasConnectedWallet && connectedWallet ? 'mt-3' : 'mt-10'} pl-4`}
      >
        <Link
          href="/markets"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/markets', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Prediction Markets
        </Link>
        <Link
          href="/terminal"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/terminal', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Trading Terminal
        </Link>
        <Link
          href="/vaults"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/vaults', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Vaults
        </Link>
        <Link
          href="/leaderboard"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/leaderboard', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Leaderboard
        </Link>
        <Link
          href="/forecasts"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/forecasts', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Forecasting
        </Link>
        <Link
          href="/skill"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/skill', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Agent Skills
        </Link>
        <Link
          href="/bots"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/bots', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Build Bots
        </Link>
        <a
          href="https://docs.sapience.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Docs
        </a>
        <Link
          href="/analytics"
          className={`flex w-fit xl:hidden px-3 py-2 rounded-full ${linkClass} ${isActive('/analytics', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Analytics
        </Link>
        <Link
          href="/feed"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/feed', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Feed
        </Link>
        {/* Mobile settings link, placed under links */}
        <Link
          href="/settings"
          className={`flex w-fit xl:hidden px-3 py-2 rounded-full ${linkClass} ${isActive('/settings', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Settings
        </Link>
      </nav>
      {ready && hasConnectedWallet && connectedWallet && (
        <div className="flex w-fit xl:hidden mt-3 ml-4">
          <Button
            asChild
            variant="default"
            size="xs"
            className="rounded-full h-9 px-3 min-w-[122px] justify-start gap-2"
            onClick={handleLinkClick}
          >
            <Link
              href={`/profile/${effectiveAddress ?? connectedWallet.address}`}
              className="flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              <span className="relative top-[1px] xl:top-0 text-sm mr-1">
                Your Profile
              </span>
            </Link>
          </Button>
        </div>
      )}
    </>
  );
};

const Header = () => {
  const { ready, hasConnectedWallet, connectedWallet } = useConnectedWallet();
  const { openConnectDialog, openAndStartSession } = useConnectDialog();
  const { setLoggedOut } = useAuth();
  const { disconnect } = useDisconnect();
  const { toast } = useToast();
  const [isScrolled, setIsScrolled] = useState(false);
  const thresholdRef = useRef(12);
  const headerRef = useRef<HTMLElement | null>(null);
  const [isGetAccessOpen, setIsGetAccessOpen] = useState(false);
  const [isReferralsOpen, setIsReferralsOpen] = useState(false);
  const [isReferralRequiredOpen, setIsReferralRequiredOpen] = useState(false);
  const lastWalletAddressRef = useRef<string | null>(null);

  // Session context for smart account sessions
  const {
    isSessionActive,
    startSession,
    endSession,
    isStartingSession,
    smartAccountAddress,
    accountMode,
    setAccountMode,
    isUsingSmartAccount,
    effectiveAddress,
  } = useSession();

  const { connectionDurationHours } = useSettings();

  useEffect(() => {
    const recalcThreshold = () => {
      try {
        const isDesktop =
          typeof window !== 'undefined' &&
          window.matchMedia('(min-width: 1280px)').matches;
        let next = 4; // small default for mobile
        if (isDesktop) {
          const el = headerRef.current;
          if (el) {
            const pt = parseFloat(getComputedStyle(el).paddingTop || '0');
            // Trigger after crossing half the initial top padding
            next = Math.max(0, pt * 0.5);
          } else {
            next = 12; // reasonable fallback
          }
        }
        thresholdRef.current = next;
        if (typeof window !== 'undefined') {
          setIsScrolled(window.scrollY > next);
        }
      } catch {
        /* noop */
      }
    };

    const onScroll = () => {
      try {
        setIsScrolled(window.scrollY > thresholdRef.current);
      } catch {
        /* noop */
      }
    };

    recalcThreshold();
    onScroll();
    window.addEventListener('resize', recalcThreshold);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', recalcThreshold);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Publish header height so pages can reserve space alongside banner offset
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setHeaderHeight = () => {
      document.documentElement.style.setProperty(
        '--header-height',
        `${el.offsetHeight}px`
      );
    };

    setHeaderHeight();

    const resizeObserver = new ResizeObserver(() => {
      setHeaderHeight();
    });

    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty('--header-height', '0px');
    };
  }, []);

  // When a wallet connects (or the active wallet changes), check with the
  // backend whether this address has an associated referral relationship
  // (either as a referee or a referrer). If not, open a blocking dialog
  // that requires the user to either enter a code or disconnect.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!ready || !hasConnectedWallet || !connectedWallet?.address) {
        setIsReferralRequiredOpen(false);
        lastWalletAddressRef.current = null;
        return;
      }

      const currentAddress = connectedWallet.address.toLowerCase();
      const previousAddress = lastWalletAddressRef.current;

      // Only re-check when the address actually changes.
      if (previousAddress === currentAddress) {
        return;
      }

      try {
        const data = await graphqlRequest<{
          user: {
            address: string;
            refCodeHash?: string | null;
            referredBy?: { id: number } | null;
            referredByCode?: { id: number } | null;
          } | null;
        }>(USER_REFERRAL_STATUS_QUERY, { wallet: currentAddress });

        if (cancelled) return;

        const user = data?.user;
        const hasServerReferral = !!(
          user &&
          (user.refCodeHash || user.referredBy || user.referredByCode)
        );

        // Update ref only after successful check to avoid race conditions
        lastWalletAddressRef.current = currentAddress;

        if (hasServerReferral) {
          setIsReferralRequiredOpen(false);
          return;
        }

        // No referral relationship on the backend: require a code.
        setIsReferralRequiredOpen(true);
      } catch {
        // On network or GraphQL errors, fall back to localStorage so we don't
        // accidentally lock out users who have previously provided a code.
        // Update ref here too so we don't keep retrying on persistent errors
        lastWalletAddressRef.current = currentAddress;
        try {
          if (typeof window === 'undefined') return;
          const key = `sapience:referralCode:${currentAddress}`;
          const existing = window.localStorage.getItem(key);
          setIsReferralRequiredOpen(!existing);
        } catch {
          // If localStorage is unavailable, err on the side of not gating.
          setIsReferralRequiredOpen(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [ready, hasConnectedWallet, connectedWallet?.address]);

  // Handle start session
  const handleStartSession = async () => {
    try {
      await startSession({
        durationHours:
          connectionDurationHours ?? DEFAULT_CONNECTION_DURATION_HOURS,
      });
      toast({
        title: 'Connection Established',
        description: 'You can now use the app without signing transactions.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      toast({
        title: 'Failed to Start Session',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  const handleLogout = () => {
    // End any active session first
    if (isSessionActive) {
      console.debug('[Header] Ending active session before logout');
      endSession();
    } else {
      console.debug('[Header] No active session to end');
    }

    // Clear app-specific localStorage items first
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('sapience.chat.token');
        window.localStorage.removeItem('sapience.chat.tokenExpiresAt');
        window.dispatchEvent(new Event('sapience:chat_logout'));
      }
    } catch {
      // localStorage not available
    }

    // Disconnect wagmi connections
    try {
      disconnect?.();
    } catch {
      // Ignore disconnect errors
    }

    // Mark as logged out in app state
    // This handles wallets that don't support programmatic disconnect (e.g., Frame)
    setLoggedOut();
  };

  return (
    <>
      {/* Top Header Bar */}
      <header
        ref={headerRef}
        style={{ top: 'var(--banner-offset, 0px)' } as React.CSSProperties}
        className={`w-full pt-2 pb-2 xl:py-6 z-[50] sticky left-0 right-0 pointer-events-none bg-background/30 backdrop-blur-sm border-b border-border/20 overflow-x-clip xl:bg-transparent xl:backdrop-blur-0 xl:border-b-0 xl:overflow-visible`}
      >
        <div className={`mx-auto px-4 xl:px-6 transition-all`}>
          <div
            className={`flex items-center justify-between pointer-events-auto transition-all ${isScrolled ? 'xl:bg-background/60 xl:backdrop-blur-sm xl:border-y xl:border-border/30 xl:rounded-none xl:border-l-0' : ''}`}
          >
            <div className="flex flex-col pointer-events-auto">
              <div className="flex items-center">
                <div className="flex flex-col order-2 xl:order-1">
                  <div className="flex items-center p-2 pr-4 xl:pr-1 xl:rounded-full">
                    <Link href="/" className="inline-block">
                      <div className="flex items-center">
                        <Image
                          src="/logo.svg"
                          alt="Sapience"
                          width={160}
                          height={32}
                          className="opacity-100"
                          priority
                        />
                        <Badge
                          variant="outline"
                          className="ml-2 px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono border-foreground/40 bg-foreground/10 text-foreground tracking-widest opacity-75"
                        >
                          BETA
                        </Badge>
                      </div>
                    </Link>
                  </div>
                </div>
                {/* Mobile Sidebar Trigger (outside blurred div, to the right) */}
                <SidebarTrigger
                  id="nav-sidebar"
                  className="xl:hidden -mr-0.5 order-1 xl:order-2 flex items-center justify-center h-10 w-10 rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </SidebarTrigger>
              </div>
            </div>

            {/* Desktop Nav (right-aligned cluster) */}
            <nav className="hidden xl:flex items-center gap-2 xl:gap-3 pointer-events-auto ml-auto mr-2 xl:mr-4">
              <Link
                href="/markets"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Prediction Markets
              </Link>
              <Link
                href="/terminal"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Trading Terminal
              </Link>
              <Link
                href="/vaults"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Vaults
              </Link>
              {ready && hasConnectedWallet && connectedWallet?.address && (
                <Link
                  href={`/profile/${effectiveAddress ?? connectedWallet.address}`}
                  className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
                >
                  Profile
                </Link>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full inline-flex items-center gap-1 focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none ring-0 hover:bg-transparent hover:text-accent-gold`}
                  >
                    More
                    <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link
                      href="/leaderboard"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Trophy className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Leaderboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/forecasts"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Telescope className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Forecasting</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/skill"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Sparkles className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Agent Skills</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/bots"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Bot className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Build Bots</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/analytics"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <BarChart3 className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Analytics</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/feed"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Activity className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Feed</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/settings"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Settings className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="https://docs.sapience.xyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <BookOpen className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Docs</span>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 xl:gap-4 pointer-events-auto">
              {/* Settings icon button replaced by text link in desktop nav */}
              {ready && hasConnectedWallet && (
                <CollateralBalanceButton className="hidden xl:flex" />
              )}
              {ready && hasConnectedWallet && (
                <>
                  {/* In smart-account mode without session: show "Establish Connection" to start session */}
                  {accountMode === 'smart-account' && !isSessionActive && (
                    <Button
                      className="rounded-md h-10 xl:h-9 px-4"
                      onClick={handleStartSession}
                      disabled={isStartingSession || !smartAccountAddress}
                    >
                      {isStartingSession
                        ? 'Connecting...'
                        : 'Establish Connection'}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-md h-9 w-9 p-0 overflow-hidden bg-brand-black text-brand-white border border-brand-white/10 hover:bg-brand-black/90"
                      >
                        {(effectiveAddress ?? connectedWallet?.address) ? (
                          <EnsAvatar
                            address={
                              effectiveAddress ?? connectedWallet!.address
                            }
                            className="h-9 w-9 rounded-md"
                            width={36}
                            height={36}
                          />
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                        <span className="sr-only">User Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="flex items-center cursor-pointer"
                        onSelect={(event) => {
                          event.preventDefault();
                          setIsReferralsOpen(true);
                        }}
                      >
                        <Users className="mr-0.5 opacity-75 h-4 w-4" />
                        <span>Referrals</span>
                      </DropdownMenuItem>
                      {/* Account mode toggle - switch between smart account and wallet */}
                      {smartAccountAddress && (
                        <DropdownMenuItem
                          className="flex items-center cursor-pointer"
                          onSelect={async () => {
                            if (accountMode === 'smart-account') {
                              // Switching to EOA mode
                              setAccountMode('eoa');
                            } else {
                              // Switching to smart-account mode - also start session
                              setAccountMode('smart-account');
                              await handleStartSession();
                            }
                          }}
                        >
                          <Wallet className="mr-0.5 opacity-75 h-4 w-4" />
                          <span>
                            {accountMode === 'smart-account'
                              ? 'Use wallet'
                              : 'Use account'}
                          </span>
                        </DropdownMenuItem>
                      )}
                      {/* End session - only show when in smart account mode with active session */}
                      {isUsingSmartAccount && isSessionActive && (
                        <DropdownMenuItem
                          className="flex items-center cursor-pointer"
                          onSelect={endSession}
                        >
                          <XCircle className="mr-0.5 opacity-75 h-4 w-4" />
                          <span>End session</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="flex items-center cursor-pointer"
                        onClick={handleLogout}
                      >
                        <LogOut className="mr-0.5 opacity-75 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ReferralsDialog
                    open={isReferralsOpen}
                    onOpenChange={setIsReferralsOpen}
                    walletAddress={connectedWallet?.address}
                  />
                </>
              )}
              {/* Address now displayed inside the black default button on desktop */}
              {ready && !hasConnectedWallet && (
                <>
                  <Button
                    onClick={() => setIsGetAccessOpen(true)}
                    className="btn-get-access hidden sm:inline-flex rounded-md h-10 xl:h-9 px-4 text-brand-black hover:text-white font-semibold border-0 transition-colors duration-400 font-mono uppercase tracking-widest text-sm"
                  >
                    <span className="relative z-10">Get Access</span>
                  </Button>
                  <Button
                    onClick={openConnectDialog}
                    className="bg-primary hover:bg-primary/90 rounded-md h-10 xl:h-9 w-auto px-4 ml-1.5 xl:ml-0 gap-2"
                  >
                    <span>Log in</span>
                  </Button>
                  <GetAccessDialog
                    open={isGetAccessOpen}
                    onOpenChange={setIsGetAccessOpen}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {ready && hasConnectedWallet && connectedWallet?.address && (
        <RequiredReferralCodeDialog
          open={isReferralRequiredOpen}
          onOpenChange={setIsReferralRequiredOpen}
          walletAddress={connectedWallet.address}
          onCodeSet={() => {
            setIsReferralRequiredOpen(false);
            // Open ConnectDialog and start session creation with progress overlay
            if (!isSessionActive && !isStartingSession) {
              openAndStartSession();
            }
          }}
          onLogout={handleLogout}
        />
      )}

      {/* Mobile Sidebar only */}
      <Sidebar
        id="nav-sidebar"
        variant="sidebar"
        collapsible="offcanvas"
        className="xl:hidden"
      >
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 p-2 pl-4 pb-2">
            <Button size="icon" className="h-6 w-6 rounded-full" asChild>
              <a
                href="https://github.com/sapiencexyz/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/github.svg"
                  alt="GitHub"
                  width={14}
                  height={14}
                />
              </a>
            </Button>
            <Button size="icon" className="h-6 w-6 rounded-full" asChild>
              <a
                href="https://x.com/sapiencemarkets"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/x.svg"
                  alt="Twitter"
                  width={12}
                  height={12}
                />
              </a>
            </Button>
            <Button size="icon" className="h-6 w-6 rounded-full" asChild>
              <a
                href="https://discord.gg/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src="/discord.svg"
                  className="dark:invert"
                  alt="Discord"
                  width={12}
                  height={12}
                />
              </a>
            </Button>
            <Button size="icon" className="h-6 w-6 rounded-full" asChild>
              <a
                href="https://blog.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiSubstack
                  className="h-3 w-3  scale-[70%]"
                  aria-label="Substack"
                />
              </a>
            </Button>
          </div>
          <div className="flex flex-col gap-2 text-xs w-full ml-4 rounded-lg -mt-1">
            <StatusIndicators />
            <div className="flex items-center gap-3 pb-3">
              <a
                href="https://docs.sapience.xyz/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms
              </a>
              <a
                href="https://docs.sapience.xyz/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
    </>
  );
};

export default Header;
