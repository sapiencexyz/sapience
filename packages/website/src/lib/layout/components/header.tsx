'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';

export const Header = () => {
  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-20 w-full border-b border-border bg-background p-4 md:bg-transparent md:px-14 md:py-6 md:backdrop-blur-md">
      <section className="flex items-center justify-between">
        <Image src="/assets/logo.svg" alt="Logo" width={132} height={132} />
        <div className="ml-auto flex items-center gap-6 md:gap-8">
          <a
            href="https://docs.foil.xyz"
            className="font-semibold text-foreground decoration-1 underline-offset-2 hover:underline"
          >
            Docs
          </a>
          <Button asChild className="rounded-2xl p-6 font-semibold">
            <a href="https://app.foil.xyz">Go to App</a>
          </Button>
        </div>
      </section>
    </header>
  );
};
