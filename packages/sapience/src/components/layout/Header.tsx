/* eslint-disable sonarjs/no-duplicate-string */
import { Button } from '@foil/ui/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarTrigger,
} from '@foil/ui/components/ui/sidebar';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import ConnectButton from '../ConnectButton';
import LottieIcon from '../LottieIcon';
import ModeToggle from '../ModeToggle';

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

const NavLinks = ({ isMobile = false, onClose }: NavLinksProps) => {
  const pathname = usePathname();
  const linkClass = isMobile
    ? 'text-xl font-medium justify-start rounded-full'
    : 'text-base font-medium justify-start rounded-full';
  const activeClass = 'bg-secondary';

  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <nav className="flex flex-col gap-3 w-full my-48 ml-4">
      <Link href="/predictions" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/predictions', pathname) ? activeClass : ''}`}
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
          Use Bots
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
        href="https://discord.com"
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

  return (
    <>
      {/* Top Header Bar */}
      <header className="w-full py-5 md:py-6 z-[50] fixed top-0 left-0">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center bg-background/30 p-2 backdrop-blur-sm rounded-full">
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
            <SidebarTrigger className="block flex items-center justify-center opacity-40 hover:opacity-90 ml-4 lg:ml-6" />
          </div>

          <div className="flex items-center gap-5">
            <div className="block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <Sidebar variant="sidebar" collapsible="offcanvas">
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
      </Sidebar>
    </>
  );
};

export default Header;
