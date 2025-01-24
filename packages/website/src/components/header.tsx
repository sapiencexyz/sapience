'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';

export const Header = () => {
  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-20 w-full border-b border-border bg-background p-6 pb-4 pt-7 md:bg-transparent md:px-14 md:pb-6 md:pt-8 md:backdrop-blur-md">
      <section className="flex items-center justify-between">
        <Image src="/assets/logo.svg" alt="Logo" width={132} height={132} />
        <div className="ml-auto flex items-center gap-6 md:gap-8">
          <Button
            asChild
            className="flex items-center rounded-2xl p-6 font-semibold"
          >
            <a href="https://app.foil.xyz" className="hidden md:inline-flex">
              Go to App
            </a>
          </Button>
          <Button
            asChild
            className="flex items-center rounded-2xl p-6 font-semibold md:hidden"
          >
            <a href="https://app.foil.xyz">Install App</a>
          </Button>
        </div>
      </section>
    </header>
  );
};
