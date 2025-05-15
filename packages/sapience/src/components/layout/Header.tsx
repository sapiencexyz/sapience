'use client';

/* eslint-disable sonarjs/no-duplicate-string */
import { Button } from '@foil/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@foil/ui/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@foil/ui/components/ui/sidebar';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ExternalLink, Menu, User, LogOut } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import ModeToggle from './ModeToggle';

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
  const { setOpenMobile, isMobile } = useSidebar();
  const linkClass = isMobileProp
    ? 'text-xl font-medium justify-start rounded-full'
    : 'text-base font-medium justify-start rounded-full';
  const activeClass = 'bg-secondary';

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <nav className="flex flex-col gap-3 w-full my-48 pl-4">
      <Link href="/forecasting" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/forecasting', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Forecasting
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
      <Link href="/bots" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/bots', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Build Bots
        </Button>
      </Link>
      <Link href="/futarchy" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/futarchy', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Futarchy
        </Button>
      </Link>
      <Link
        href="https://x.com/sapiencexyz"
        passHref
        className="flex w-fit"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/news', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          <span className="flex items-center">
            News
            <ExternalLink className="h-4 w-4 ml-1.5 opacity-70" />
          </span>
        </Button>
      </Link>
      <Link
        href="https://discord.gg/Hn2vzMDCSs"
        passHref
        className="flex w-fit"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/community', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          <span className="flex items-center">
            Community
            <ExternalLink className="h-4 w-4 ml-1.5 opacity-70" />
          </span>
        </Button>
      </Link>
    </nav>
  );
};

const Header = () => {
  const pathname = usePathname();
  const { login, ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const connectedWallet = wallets[0]; // Get the first connected wallet

  return (
    <>
      {/* Top Header Bar */}
      <header className="w-full py-5 md:py-6 z-[50] fixed top-0 left-0">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
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

          {/* Mobile Sidebar Trigger Button (fixed left, with border, hover effect) */}
          <SidebarTrigger
            id="nav-sidebar"
            className="fixed left-0 top-16 z-[51] flex items-center justify-center md:hidden border border-l-0 border-border bg-background/30 p-5 pl-4 backdrop-blur-sm rounded-r-full opacity-90 hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <Menu className="h-6 w-6" />
          </SidebarTrigger>

          <div className="flex items-center gap-4">
            <div className="block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
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
                  {connectedWallet && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/profile/${connectedWallet.address}`}
                        className="flex items-center cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
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
                className="bg-primary hover:bg-primary/90 rounded-full px-8"
                size="lg"
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
          <div className="flex items-start gap-2 text-xs w-full p-2 rounded-lg max-w-[180px]">
            <span>🏗️</span>
            <div>
              We&apos;re{' '}
              <a
                href="https://github.com/foilxyz/foil/tree/main/packages/sapience"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 underline"
              >
                building in public
              </a>{' '}
              and{' '}
              <a
                href="https://discord.gg/Hn2vzMDCSs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 underline"
              >
                want your feedback
              </a>
              .
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
    </>
  );
};

export default Header;
