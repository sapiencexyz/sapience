/* eslint-disable sonarjs/no-duplicate-string */
import { Menu, Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { FaDiscord } from 'react-icons/fa';

import ConnectButton from '../ConnectButton';
import ModeToggle from '../ModeToggle';
import { Button } from '~/components/ui/button';
import { Drawer, DrawerContent, DrawerTrigger } from '~/components/ui/drawer';

const isActive = (path: string, pathname: string) => {
  if (path === '/') {
    return pathname === path;
  }
  return pathname.startsWith(path);
};

const NavLinks = ({
  isMobile = false,
  onClose,
}: {
  isMobile?: boolean;
  onClose?: () => void;
}) => {
  const pathname = usePathname();

  const getButtonClasses = (path: string) => {
    const baseClasses = "text-base md:text-lg font-medium";
    return `${baseClasses} ${isActive(path, pathname) ? 'bg-secondary' : ''}`;
  };

  if (isMobile) {
    return (
      <div className="flex flex-col space-y-4 font-medium py-4">
        <Link href="/predictions" onClick={() => onClose?.()}>
          Predictions
        </Link>
        <Link href="/leaderboard" onClick={() => onClose?.()}>
          Leaderboard
        </Link>
        <Link href="/bots" onClick={() => onClose?.()}>
          Build Bots
        </Link>
        <Link href="/community" onClick={() => onClose?.()}>
          <div className="flex items-center">
            <FaDiscord className="h-3 w-3 opacity-30" />
            Community
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center w-[40dvw] max-w-[600px] mx-auto">
      <Link href="/predictions" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/predictions')}>
          Predictions
        </Button>
      </Link>

      <Link href="/leaderboard" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/leaderboard')}>
          Leaderboard
        </Button>
      </Link>

      <Link href="/bots" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/bots')}>
          Build Bots
        </Button>
      </Link>

      <Link href="/community" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/community')}>
          <FaDiscord className="h-3 w-3 opacity-30" />
          Community
        </Button>
      </Link>
    </div>
  );
};

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="w-full py-5 md:py-6 z-[3] border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
          <Link href="/" className="inline-block">
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2">
                <Globe className="h-6 w-6" />
                <span className="text-2xl font-normal">Sapience</span>
              </div>
            </div>
          </Link>

          <div className="hidden lg:block">
            <NavLinks />
          </div>

          <div className="flex items-center gap-2">
            <ConnectButton />
            <div className="hidden lg:block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
          </div>
        </div>
      </header>
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border py-4 px-4 text-center z-[3] lg:hidden">
        <div className="flex justify-between items-center max-w-[400px] mx-auto">
          <Link href="/" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={`text-base font-normal ${isActive('/', pathname) ? 'bg-secondary' : ''}`}
            >
              <Globe className="h-5 w-5 mr-1" />
              Sapience
            </Button>
          </Link>

          <Link href="/predictions" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={`text-base ${isActive('/predictions', pathname) ? 'bg-secondary' : ''}`}
            >
              Predictions
            </Button>
          </Link>
          
          <Link href="/leaderboard" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={`text-base ${isActive('/leaderboard', pathname) ? 'bg-secondary' : ''}`}
            >
              Leaderboard
            </Button>
          </Link>

          <Link href="/bots" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={`text-base ${isActive('/bots', pathname) ? 'bg-secondary' : ''}`}
            >
              Build Bots
            </Button>
          </Link>

          <Link href="/community" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={`text-base ${isActive('/community', pathname) ? 'bg-secondary' : ''}`}
            >
              <div className="flex items-center">
                <FaDiscord className="h-3 w-3 opacity-40" />
                Community
              </div>
            </Button>
          </Link>

          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-7 w-7" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="flex flex-col space-y-4 p-4 position-relative">
                <NavLinks isMobile onClose={() => setIsOpen(false)} />
                <div className="absolute top-2 right-5">
                  {!pathname.startsWith('/earn') && <ModeToggle />}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </>
  );
};

export default Header;
