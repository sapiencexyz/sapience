'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@sapience/ui/components/ui/button';
import FeaturedMarketGroupSection from './FeaturedMarketGroupSection';

export default function Hero() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          // Try to inject a style element to force light mode
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          // Security policy might prevent this
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []);

  return (
    <>
      <div className="relative h-[100dvh] w-full flex flex-col justify-end pt-6 md:pt-0 pb-2 md:pb-3 lg:pb-4">
        {/* Spline embed background - made larger than viewport */}
        <div
          className="absolute inset-0 z-0 light"
          style={{
            colorScheme: 'light',
            filter: 'none',
          }}
        >
          <iframe
            ref={iframeRef}
            src="https://my.spline.design/particles-672e935f9191bddedd3ff0105af8f117/"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              colorScheme: 'light',
              filter: 'none',
            }}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
          />
        </div>

        {/* Bottom fade overlay to soften the iframe edge */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 md:h-40 z-[1] bg-gradient-to-b from-transparent to-[hsl(var(--background))]" />

        {/* Content container - positioned at bottom, left-aligned */}
        <div className="w-full z-10">
          <div className="container px-0 pb-0">
            <div className="text-left px-4 md:px-8 pt-2 pb-2 md:pt-24">
              <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
                The World&apos;s Frontier
                <br />
                Forecasting Community
              </h1>

              <p className="text-xl md:text-2xl mb-3 text-muted-foreground">
                Join experts and enthusiasts forecasting the future of the
                economy, climate change, culture, and more.
              </p>
            </div>
            <div className="px-0 md:px-8">
              <FeaturedMarketGroupSection />
              <div className="md:hidden w-full flex justify-center mt-3 mb-3 px-4">
                <Button
                  variant="link"
                  size="xs"
                  asChild
                  className="h-6 px-0 inline-flex items-center text-sm font-normal text-muted-foreground hover:text-foreground"
                >
                  <Link
                    href="/markets"
                    className="group inline-flex items-center"
                  >
                    <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                      Explore Prediction Markets
                    </span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
