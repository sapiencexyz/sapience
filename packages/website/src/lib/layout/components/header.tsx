'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Share, PlusSquare } from 'lucide-react';

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
          {/* Desktop button */}
          <Button
            asChild
            className="hidden rounded-2xl p-6 font-semibold md:flex"
          >
            <a href="https://app.foil.xyz">Go to App</a>
          </Button>
          {/* Mobile install button with drawer */}
          <div className="md:hidden">
            <Drawer>
              <DrawerTrigger asChild>
                <Button className="rounded-2xl p-6 font-semibold">
                  Install App
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <div className="mx-auto w-full max-w-sm">
                  <DrawerHeader>
                    <div className="my-4 flex justify-center">
                      <Image
                        src="/icons/icon-192x192.png"
                        alt="Foil App Icon"
                        width={72}
                        height={72}
                        className="rounded-2xl border border-border shadow-lg"
                      />
                    </div>
                    <DrawerTitle className="text-center text-2xl">
                      Install Foil
                    </DrawerTitle>
                    <p className="text-center text-muted-foreground">
                      Add the app to your home screen
                    </p>
                  </DrawerHeader>
                  <DrawerFooter>
                    <div className="space-y-4 rounded-lg bg-muted px-4 py-8 text-center">
                      <div className="space-y-2">
                        <p className="text-lg">
                          Tap the{' '}
                          <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                            <Share className="h-5 w-5" />
                          </span>{' '}
                          share icon in your browser
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg">
                          Select{' '}
                          <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                            <PlusSquare className="h-5 w-5" />
                          </span>{' '}
                          Add to Home Screen
                        </p>
                      </div>
                    </div>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </section>
    </header>
  );
};
