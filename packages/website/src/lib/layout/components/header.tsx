'use client';

import EmailCaptureButton from '@/lib/components/EmailCaptureButton';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X } from 'lucide-react';

export const Header = () => {
  const [showBanner, setShowBanner] = useState(true);

  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-20 w-full border-b border-border bg-background p-4 md:bg-transparent md:px-14 md:py-6 md:backdrop-blur-md">
      <AnimatePresence>
        {showBanner && (
          <motion.div
            className="relative mb-6 rounded-4xl bg-black p-2 text-left text-background md:text-center"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="font-semibold">
              <span className="hidden md:inline">
                ⛽ Foil&apos;s Testnet Competition is coming soon
              </span>
              <span className="pl-3 md:hidden">
                ⛽&nbsp;&nbsp;Testnet Competition Coming Soon
              </span>
            </span>
            <button
              onClick={() => setShowBanner(false)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-background hover:opacity-70"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <section className="flex items-center justify-between">
        <Image src="/assets/logo.svg" alt="Logo" width={132} height={132} />
        <div className="ml-auto flex items-center gap-4 md:gap-8">
          <a
            href="https://docs.foil.xyz"
            className="font-semibold text-foreground decoration-1 underline-offset-2 hover:underline"
          >
            Docs
          </a>
          <EmailCaptureButton>Go to App</EmailCaptureButton>
        </div>
      </section>
    </header>
  );
};
