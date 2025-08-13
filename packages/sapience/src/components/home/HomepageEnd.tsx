'use client';

import { useEffect, useRef } from 'react';

// End section for the homepage with flipped spline animation from vaults page
export default function HomepageEnd() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      // Guard already exists here, but keeping it doesn't hurt
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
      // Ensure load event listener is attached only once iframe exists
      iframe.addEventListener('load', handleIframeLoad);
      // Clean up listener on unmount
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []); // Empty dependency array ensures this runs once client-side

  return (
    <div className="relative h-[25vh] w-full overflow-hidden">
      {/* Spline Background - Full Width and Flipped */}
      <div className="absolute inset-0 pointer-events-none w-full h-ful">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          className="w-full h-full"
          style={{
            border: 'none',
            colorScheme: 'light',
            filter: 'none',
          }}
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
      </div>

      {/* Top gradient fade to fade out spline */}
      <div className="absolute top-0 left-0 w-full h-[60px] bg-gradient-to-b from-background to-transparent" />

      {/* Left side gradient fade like in vaults page */}
      <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
    </div>
  );
}
