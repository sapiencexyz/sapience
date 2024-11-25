'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Header = () => {
  const [showBanner, setShowBanner] = useState(true);

  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-20 w-full border-b border-border bg-background p-4 md:bg-transparent md:px-14 md:py-6 md:backdrop-blur-md">
      <AnimatePresence>
        {showBanner && (
          <motion.div
            className="relative mb-6 rounded-4xl bg-primary p-2 text-left text-background md:text-center"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="ml-1 font-semibold">
              ⛽{' '}
              <a
                href="https://mirror.xyz/0xC388FBA22945B103496f0B89E47cd332229514b8/dF8MPB_DNhaAhGuHGcUiVBaY4LcLMT8hxYS-8QGFux4"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-block -translate-y-[0.5px] underline decoration-[0.5px] underline-offset-4"
              >
                Join the Testnet Competition
              </a>
            </span>
            <button
              onClick={() => setShowBanner(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-background hover:opacity-70"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
