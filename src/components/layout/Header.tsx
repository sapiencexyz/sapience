'use client';

import { LogOut, Menu, User, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useEffect, useRef, useState } from 'react';
import { useDisconnect } from 'wagmi';
import CollateralBalanceButton from './CollateralBalanceButton';
import {
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from '~/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Button } from '~/components/ui/button';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import EnsAvatar from '~/components/shared/EnsAvatar';
import ReferralsDialog from '~/components/shared/ReferralsDialog';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useAuth } from '~/lib/context/AuthContext';

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
          href="/"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Markets
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
              href={`/profile/${connectedWallet.address}`}
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
  const { openConnectDialog } = useConnectDialog();
  const { setLoggedOut } = useAuth();
  const { disconnect } = useDisconnect();
  const [isScrolled, setIsScrolled] = useState(false);
  const thresholdRef = useRef(12);
  const headerRef = useRef<HTMLElement | null>(null);
  const [isReferralsOpen, setIsReferralsOpen] = useState(false);

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

  const handleLogout = () => {
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
        className={`w-full pt-2 pb-2 xl:py-6 z-[50] sticky top-0 left-0 right-0 pointer-events-none bg-background/30 backdrop-blur-sm border-b border-border/20 overflow-x-clip xl:bg-transparent xl:backdrop-blur-0 xl:border-b-0 xl:overflow-visible`}
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
                href="/"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Markets
              </Link>
              <Link
                href="/vaults"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Vaults
              </Link>
              {ready && hasConnectedWallet && connectedWallet?.address && (
                <Link
                  href={`/profile/${connectedWallet.address}`}
                  className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
                >
                  Profile
                </Link>
              )}
              <Link
                href="/leaderboard"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Leaderboard
              </Link>
              <Link
                href="/analytics"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Analytics
              </Link>
              <Link
                href="/feed"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Feed
              </Link>
              <Link
                href="/settings"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Settings
              </Link>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 xl:gap-4 pointer-events-auto">
              {/* Settings icon button replaced by text link in desktop nav */}
              {ready && hasConnectedWallet && (
                <CollateralBalanceButton className="hidden xl:flex" />
              )}
              {ready && hasConnectedWallet && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-md h-9 w-9 p-0 overflow-hidden bg-brand-black text-brand-white border border-brand-white/10 hover:bg-brand-black/90"
                      >
                        {connectedWallet?.address ? (
                          <EnsAvatar
                            address={connectedWallet.address}
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
                    onClick={openConnectDialog}
                    className="bg-primary hover:bg-primary/90 rounded-md h-10 xl:h-9 w-auto px-4 ml-1.5 xl:ml-0 gap-2"
                  >
                    <span>Log in</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

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
      </Sidebar>
    </>
  );
};

export default Header;
