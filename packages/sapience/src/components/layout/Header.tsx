'use client';

import {
  usePrivy,
  useWallets,
  useConnectOrCreateWallet,
} from '@privy-io/react-auth';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sapience/sdk/ui/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@sapience/sdk/ui/components/ui/sidebar';
import {
  LogOut,
  Menu,
  User,
  BookOpen,
  Settings,
  ChevronDown,
  Telescope,
  Bot,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SiSubstack } from 'react-icons/si';

import { useEffect, useRef, useState } from 'react';
import { useDisconnect } from 'wagmi';
import CollateralBalanceButton from './CollateralBalanceButton';
import { shortenAddress } from '~/lib/utils/util';
import { useEnsName } from '~/components/shared/AddressDisplay';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import EnsAvatar from '~/components/shared/EnsAvatar';

// logo.svg will be rendered via next/image below

const isActive = (path: string, pathname: string) => {
  if (path === '/') {
    return pathname === path;
  }
  return pathname.startsWith(path);
};

interface NavLinksProps {
  isMobile?: boolean;
  onClose?: () => void;
}

const NavLinks = ({
  isMobile: isMobileProp = false,
  onClose,
}: NavLinksProps) => {
  const pathname = usePathname();
  const { ready, hasConnectedWallet, connectedWallet } = useConnectedWallet();
  const { setOpenMobile, isMobile } = useSidebar();
  const linkClass = isMobileProp
    ? 'sc-heading justify-start rounded-full'
    : 'sc-heading justify-start rounded-full';
  const activeClass = 'bg-secondary';

  // No feature flag: Chat button is always available in the sidebar for authenticated users

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
      <nav className="flex flex-col gap-3 w-full mt-10 pl-4">
        <Link
          href="/markets"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/markets', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Prediction Markets
        </Link>
        <Link
          href="/leaderboard"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/leaderboard', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Leaderboard
        </Link>
        <Link
          href="/vaults"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/vaults', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Vaults
        </Link>
        <Link
          href="/forecast"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/forecast', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Forecasting
        </Link>
        <Link
          href="/feed"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/feed', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Activity Feed
        </Link>
        <Link
          href="/bots"
          className={`flex w-fit px-3 py-2 rounded-full ${linkClass} ${isActive('/bots', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Build Bots
        </Link>
        {/* Mobile settings link, placed under links */}
        <Link
          href="/settings"
          className={`flex w-fit md:hidden px-3 py-2 rounded-full ${linkClass} ${isActive('/settings', pathname) ? activeClass : ''} hover:text-accent-gold transition-colors`}
          onClick={handleLinkClick}
        >
          Settings
        </Link>
      </nav>
      {ready && hasConnectedWallet && connectedWallet && (
        <>
          <div className="flex w-fit md:hidden mt-3 ml-4">
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
                <span className="relative top-[1px] md:top-0 text-sm mr-1">
                  Your Profile
                </span>
              </Link>
            </Button>
          </div>
          <CollateralBalanceButton
            className="md:hidden mt-2 ml-4"
            onClick={handleLinkClick}
          />
        </>
      )}
    </>
  );
};

const Header = () => {
  const { ready, hasConnectedWallet, connectedWallet } = useConnectedWallet();
  const { wallets } = useWallets();
  const { logout } = usePrivy();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { data: ensName } = useEnsName(connectedWallet?.address || '');
  const { disconnect } = useDisconnect();
  const [isScrolled, setIsScrolled] = useState(false);
  const thresholdRef = useRef(12);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const recalcThreshold = () => {
      try {
        const isDesktop =
          typeof window !== 'undefined' &&
          window.matchMedia('(min-width: 768px)').matches;
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

  const hasDisconnect = (
    x: unknown
  ): x is { disconnect: () => Promise<void> | void } =>
    typeof (x as { disconnect?: unknown }).disconnect === 'function';

  const handleLogout = async () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('sapience.chat.token');
        window.localStorage.removeItem('sapience.chat.tokenExpiresAt');
        try {
          window.dispatchEvent(new Event('sapience:chat_logout'));
        } catch {
          /* noop */
        }
      }
    } catch {
      /* noop */
    }
    // Proactively disconnect any connected wallets (wagmi + Privy wallet instances)
    try {
      disconnect?.();
    } catch {
      /* noop */
    }
    try {
      if (Array.isArray(wallets)) {
        for (const w of wallets) {
          try {
            // Some wallet connectors expose a disconnect method
            if (hasDisconnect(w)) {
              await Promise.resolve(w.disconnect());
            }
          } catch {
            /* noop */
          }
        }
      }
    } catch {
      /* noop */
    }
    try {
      await logout();
    } catch {
      /* noop */
    }
  };

  return (
    <>
      {/* Top Header Bar */}
      <header
        ref={headerRef}
        className="w-full pt-3 pb-2 md:py-6 z-[50] fixed top-0 left-0 right-0 pointer-events-none bg-background/30 backdrop-blur-sm border-b border-border/20 overflow-x-clip md:bg-transparent md:backdrop-blur-0 md:border-b-0 md:overflow-visible"
      >
        <div className={`mx-auto px-4 md:px-6 transition-all`}>
          <div
            className={`flex items-center justify-between pointer-events-auto transition-all ${isScrolled ? 'md:bg-background/60 md:backdrop-blur-sm md:border-y md:border-border/30 md:rounded-none md:border-l-0' : ''}`}
          >
            <div className="flex flex-col pointer-events-auto">
              <div className="flex items-center">
                <div className="flex flex-col order-2 md:order-1">
                  <div className="flex items-center p-2 pr-4 md:pr-1 md:rounded-full">
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
                  className="md:hidden mr-0.5 order-1 md:order-2 flex items-center justify-center h-10 w-10 rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </SidebarTrigger>
              </div>
            </div>

            {/* Desktop Nav (right-aligned cluster) */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-3 pointer-events-auto ml-auto mr-2 lg:mr-4">
              <Link
                href="/markets"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Prediction Markets
              </Link>
              <Link
                href="/leaderboard"
                className={`sc-heading text-foreground transition-colors px-3 py-2 rounded-full hover:bg-transparent hover:text-accent-gold`}
              >
                Leaderboard
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
                      href="/forecast"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Telescope className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Forecasting</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/feed"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Zap className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Activity Feed</span>
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
                      href="/settings"
                      className="group cursor-pointer flex items-center transition-colors hover:text-accent-gold data-[highlighted]:text-accent-gold hover:bg-transparent data-[highlighted]:bg-transparent"
                    >
                      <Settings className="mr-px h-4 w-4 opacity-75 transition-colors group-hover:opacity-100 data-[highlighted]:opacity-100" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 pointer-events-auto">
              {/* Settings icon button replaced by text link in desktop nav */}
              {ready && hasConnectedWallet && (
                <CollateralBalanceButton className="hidden md:flex" />
              )}
              {ready && hasConnectedWallet && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      className="rounded-sm md:rounded-full h-10 w-10 md:h-9 md:w-auto ml-1.5 md:ml-0 gap-2 p-0 md:pl-2 md:pr-3 overflow-hidden"
                    >
                      {connectedWallet?.address ? (
                        <>
                          {/* Mobile: avatar fills the entire circular button */}
                          <EnsAvatar
                            address={connectedWallet.address}
                            className="h-full w-full ring-inset md:hidden"
                            width={40}
                            height={40}
                          />
                          {/* Desktop: small avatar next to address */}
                          <EnsAvatar
                            address={connectedWallet.address}
                            className="hidden md:inline-flex h-6.5 w-6.5 rounded-full"
                            width={24}
                            height={24}
                          />
                        </>
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                      {connectedWallet?.address && (
                        <span className="hidden md:inline text-sm">
                          {ensName || shortenAddress(connectedWallet.address)}
                        </span>
                      )}
                      <span className="sr-only">User Menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="flex items-center cursor-pointer"
                    >
                      <LogOut className="mr-0.5 opacity-75 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Address now displayed inside the black default button on desktop */}
              {ready && !hasConnectedWallet && (
                <Button
                  onClick={() => {
                    try {
                      connectOrCreateWallet();
                    } catch {
                      /* noop */
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 rounded-md h-10 md:h-9 w-auto px-4 ml-1.5 md:ml-0 gap-2"
                >
                  <span>Log in</span>
                </Button>
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
        className="md:hidden"
      >
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-2 text-xs w-full ml-4 rounded-lg">
            <div className="flex flex-col items-start gap-2 mb-3">
              <span>Powered by</span>
              <a
                href="https://ethena.fi"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src="/ethena.svg"
                  alt="Ethena"
                  width={87}
                  height={24}
                  className="dark:invert opacity-90 hover:opacity-100 transition-opacity duration-200"
                />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 pl-4 pb-4">
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
                href="https://x.com/sapiencehq"
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
            <Button size="icon" className="h-6 w-6 rounded-full" asChild>
              <a
                href="https://docs.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen className="h-3 w-3 scale-[85%]" />
              </a>
            </Button>
          </div>
          <div className="flex items-center gap-3 pl-4 pb-3 -mt-3.5">
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
        </SidebarFooter>
      </Sidebar>
    </>
  );
};

export default Header;
