'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

const FutarchyPage = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
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
    <div className="relative h-[100dvh] overflow-hidden w-full flex flex-col justify-center">
      {/* Spline embed background */}
      <div
        className="fixed inset-0 z-50 light w-[100dwv] pointer-events-none"
        style={{
          colorScheme: 'light',
          filter: 'none',
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          style={{
            opacity: 0.5,
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

      {/* Content container */}
      <div className="container max-w-[740px] mx-auto p-4 md:p-8 lg:p-20 flex flex-col justify-center z-10 relative">
        <h1 className="text-3xl md:text-4xl font-heading font-normal mb-6 md:mb-8">
          Vote on values, but bet on beliefs
        </h1>
        <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
          Economist Robin Hanson developed the concept of{' '}
          <strong className="font-semibold">futarchy</strong>, where goals are
          democratically defined and prediction markets determine which policies
          could best achieve them.
        </p>
        <p className="text-muted-foreground text-lg mb-4 leading-relaxed">
          Help lay the groundwork for futarchy by building and participating in
          the most liquid prediction markets for future forecasting on the
          planet.
        </p>
        <Link
          href="/forecasting"
          className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1.5 text-xs tracking-widest transition-all duration-300 font-semibold mt-4 self-start"
        >
          EXPLORE FORECASTS
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
};

export default FutarchyPage;
