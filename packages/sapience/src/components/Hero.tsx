'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
    <div className="relative h-[100dvh] w-[100dvw] flex flex-col justify-end">
      {/* Spline embed background - made larger than viewport */}
      <div
        className="absolute inset-0 z-0 light w-[100dwv] right-0"
        style={{
          colorScheme: 'light',
          filter: 'none',
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
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

      {/* Content container - positioned at bottom, left-aligned */}
      <div className="w-full z-10">
        <div className="container px-0 pb-0">
          <div className="text-left px-8 py-28">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              The World&apos;s Frontier
              <br />
              Prediction Community
            </h1>

            <p className="text-xl md:text-2xl mb-6 text-muted-foreground max-w-2xl">
              Join experts and enthusiasts forecasting the future of the
              economy, climate change, geopolitics, biosecurity, and more.
            </p>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault(); // Prevent default link behavior
                  window.scrollTo({
                    top: window.innerHeight, // Scroll down by viewport height
                    behavior: 'smooth',
                  });
                }}
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
              >
                LEARN MORE
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
