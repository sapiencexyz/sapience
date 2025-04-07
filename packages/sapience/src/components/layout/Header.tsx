/* eslint-disable sonarjs/no-duplicate-string */
import { Button } from '@foil/ui/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@foil/ui/components/ui/drawer';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@foil/ui/components/ui/sidebar';
import { Menu, Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import ConnectButton from '../ConnectButton';
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
    ? 'text-xl font-medium w-full justify-start'
    : 'text-base font-medium w-full justify-start';
  const activeClass = 'bg-secondary';

  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <nav className="flex flex-col gap-2 w-full my-48 ml-4">
      <Link href="/predictions" passHref>
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/predictions', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Forecasting
        </Button>
      </Link>
      <Link href="/leaderboard" passHref>
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/leaderboard', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Leaderboard
        </Button>
      </Link>
      <Link href="/bots" passHref>
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/bots', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Build Bots
        </Button>
      </Link>
      <Link href="/futarchy" passHref>
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/futarchy', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Futarchy
        </Button>
      </Link>
      <Link href="/community" passHref>
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/community', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Community
        </Button>
      </Link>
    </nav>
  );
};

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { isMobile } = useSidebar();

  return (
    <>
      {/* Top Header Bar */}
      <header className="w-full py-5 md:py-6 z-[50] fixed top-0 left-0">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center bg-background/30 p-2 backdrop-blur-sm rounded-full">
            <Link href="/" className="inline-block">
              <div className="flex items-center gap-2">
                <Globe className="h-6 w-6 opacity-80" strokeWidth={1.25} />
                <span className="text-2xl font-normal">Sapience</span>
              </div>
            </Link>
            <SidebarTrigger className="block flex items-center justify-center opacity-40 hover:opacity-90 ml-6" />
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
        <SidebarFooter>{/* Optional footer content */}</SidebarFooter>
      </Sidebar>

      {/* Mobile Drawer - only needed if you want a separate drawer in addition to the sidebar */}
      {isMobile && (
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerTrigger
            asChild
            className="fixed bottom-4 right-4 z-10 lg:hidden"
          >
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-md"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-full">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  <span className="font-semibold">Navigation</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  ✕
                </Button>
              </div>
              <NavLinks isMobile onClose={() => setIsOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
};

export default Header;
