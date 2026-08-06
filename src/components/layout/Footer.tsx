'use client';

import { Button } from '~/components/ui/button';
import { StatusIndicators } from '~/components/layout/StatusIndicators';

const Footer = () => {
  return (
    <footer className="mt-auto block w-full border-t border-border/20 sm:border-border/40 bg-background/60 backdrop-blur-sm relative z-[40] sm:fixed sm:bottom-0 sm:left-0">
      <div className="mx-auto px-4 sm:px-3 pt-3 pb-2 sm:py-2 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
        <StatusIndicators />

        <Button
          size="sm"
          className="h-7 rounded-full px-4 bg-accent-gold text-brand-black hover:bg-accent-gold/90 font-mono text-xs uppercase tracking-wider"
          asChild
        >
          <a
            href="https://meridian.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            Trade on Meridian
          </a>
        </Button>
      </div>
    </footer>
  );
};

export default Footer;
