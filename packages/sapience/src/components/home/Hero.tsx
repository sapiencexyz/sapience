'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

// Dynamically import LottieScroll
const LottieScroll = dynamic(() => import('./LottieScroll'), {
  ssr: false,
  loading: () => null,
});

export default function Hero() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scrollOpacity, setScrollOpacity] = useState(1);

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

  // Handle scroll fade out effect
  useEffect(() => {
    const handleScroll = () => {
      // Start fading out after 50px of scroll, completely gone by 200px
      const { scrollY } = window;
      const newOpacity = Math.max(0, 1 - scrollY / 150);
      setScrollOpacity(newOpacity);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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

      {/* Centered Lottie Scroll Animation */}
      <div
        className="fixed left-1/2 bottom-8 -translate-x-1/2 z-20 hidden md:block"
        style={{ opacity: scrollOpacity, transition: 'opacity 0.2s ease-out' }}
      >
        <LottieScroll width={50} height={50} />
      </div>

      {/* Content container - positioned at bottom, left-aligned */}
      <div className="w-full z-10">
        <div className="container px-0 pb-0">
          <div className="text-left px-8 py-24">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              The World&apos;s Frontier
              <br />
              Forecasting Community
            </h1>

            <p className="text-xl md:text-2xl mb-6 text-muted-foreground max-w-2xl">
              Join experts and enthusiasts forecasting the future of the
              economy, climate change, geopolitics, biosecurity, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
