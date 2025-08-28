'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/ui/components/ui/button';
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
  Wallet,
  MessageCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SiSubstack } from 'react-icons/si';

import ModeToggle from './ModeToggle';
import SusdeBalance from './SusdeBalance';
import { useChat } from '~/lib/context/ChatContext';

// Dynamically import LottieIcon
const LottieIcon = dynamic(() => import('./LottieIcon'), {
  ssr: false,
  // Optional: Add a simple placeholder or skeleton
  loading: () => <div className="w-8 h-8 opacity-80" />,
});

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
  const searchParams = useSearchParams();
  const { setOpenMobile, isMobile } = useSidebar();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { openChat } = useChat();
  const [chatEnabled, setChatEnabled] = useState(false);
  useEffect(() => {
    try {
      const value =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('chat')
          : null;
      setChatEnabled(value === 'true');
    } catch {
      setChatEnabled(false);
    }
  }, []);
  useEffect(() => {
    try {
      const qp = searchParams?.get('chat');
      if (qp === 'true') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('chat', 'true');
        }
        setChatEnabled(true);
      } else if (qp === 'false') {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('chat');
        }
        setChatEnabled(false);
      }
    } catch {
      /* noop */
    }
  }, [searchParams]);
  const connectedWallet = wallets[0];
  const linkClass = isMobileProp
    ? 'text-xl font-medium justify-start rounded-full'
    : 'text-base font-medium justify-start rounded-full';
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
    <nav className="flex flex-col gap-3 w-full mt-32 lg:mt-44 pl-4">
      <Link href="/markets" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/markets', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Prediction Markets
        </Button>
      </Link>
      <Link href="/vaults" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/vaults', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Vaults
        </Button>
      </Link>
      <Link href="/leaderboard" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/leaderboard', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Leaderboard
        </Button>
      </Link>
      <Link href="/forecast" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/forecast', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Forecasting
        </Button>
      </Link>
      <Link href="/bots" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/bots', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Build Bots
        </Button>
      </Link>
      {chatEnabled && (
        <div className="mt-6">
          <div className="flex w-fit mx-3 mt-0">
            <Button
              variant="outline"
              size="xs"
              className="rounded-full px-3 justify-start gap-2 border-black/30 dark:border-white/30"
              onClick={() => {
                handleLinkClick();
                openChat();
              }}
            >
              <MessageCircle className="h-3 w-3 scale-[0.8]" />
              <span className="relative top-[1px]">Chat</span>
            </Button>
          </div>
        </div>
      )}
      {ready && authenticated && connectedWallet && (
        <div className="mt-6">
          <div className="mt-4">
            <SusdeBalance onClick={handleLinkClick} />
          </div>
          <Link
            href={`/profile/${connectedWallet.address}`}
            passHref
            className="flex w-fit mx-3 mt-4"
          >
            <Button
              size="xs"
              className="rounded-full px-3"
              onClick={handleLinkClick}
            >
              <Wallet className="h-3 w-3 scale-[0.8]" />
              Your Portfolio
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

const Header = () => {
  const pathname = usePathname();
  const { login, ready, authenticated, logout } = usePrivy();

  return (
    <>
      {/* Top Header Bar */}
      <header className="w-full py-5 md:py-6 z-[50] fixed top-0 left-0 pointer-events-none">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex flex-col pointer-events-auto">
            <div className="flex items-center">
              <div className="flex flex-col order-2 md:order-1">
                <div className="flex items-center bg-background/30 p-2 pr-4 md:pr-1 backdrop-blur-sm rounded-full">
                  <Link href="/" className="inline-block">
                    <div className="flex items-center gap-2">
                      <LottieIcon
                        animationPath="/lottie/logomark.json"
                        width={32}
                        height={32}
                        className="opacity-80"
                      />
                      <span className="text-2xl font-normal">Sapience</span>
                    </div>
                  </Link>
                  {/* Desktop Sidebar Trigger (inside header) */}
                  <SidebarTrigger
                    id="nav-sidebar"
                    className="hidden md:flex items-center justify-center opacity-40 hover:opacity-90 ml-4 lg:ml-6"
                  />
                </div>
                <div className="-mt-3.5 ml-[124px] text-xs tracking-wider text-muted-foreground scale-75 origin-left font-medium">
                  BETA
                </div>
              </div>
              {/* Mobile Sidebar Trigger (outside blurred div, to the right) */}
              <SidebarTrigger
                id="nav-sidebar"
                className="md:hidden mr-1 order-1 md:order-2 flex items-center justify-center h-10 w-10 rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 pointer-events-auto">
            <div className="block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
            {ready && null}
            {!ready && null /* Render nothing while Privy is loading */}
            {ready && authenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="rounded-full"
                  >
                    <User className="h-5 w-5" />
                    <span className="sr-only">User Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={logout}
                    className="flex items-center cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {ready && !authenticated && (
              <Button
                onClick={login}
                className="bg-primary hover:bg-primary/90 rounded-full px-4 sm:px-6"
              >
                Log In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <Sidebar id="nav-sidebar" variant="sidebar" collapsible="offcanvas">
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-2 text-xs w-full ml-4 rounded-lg">
            <div className="flex flex-col items-start gap-2 mb-2">
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
                href="https://twitter.com/sapiencexyz"
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
        </SidebarFooter>
      </Sidebar>
    </>
  );
};

export default Header;
