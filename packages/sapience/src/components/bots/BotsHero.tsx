'use client';

import { useEffect, useRef } from 'react';

// Hero section for the bots page - smaller than homepage hero but still exciting
export default function BotsHero() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (typeof document === 'undefined') return;
    if (iframe && iframe.contentDocument) {
      const style = iframe.contentDocument.createElement('style');
      style.textContent = `
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        body { background-color: transparent; margin: 0; padding: 1rem; } /* Example: Ensure transparent background */
      `;
      iframe.contentDocument.head.appendChild(style);
    }
  }, []);

  return (
    <div className="relative overflow-hidden flex items-center justify-center w-full">
      {/* Outer container with padding and iframe background */}
      <div className="relative z-10 w-full px-6 pt-36 max-w-[1020px] mx-auto">
        <div className="relative overflow-hidden rounded-xl shadow-inner">
          {/* Iframe as background within the outer box */}
          <div
            className="absolute inset-0 z-0 overflow-hidden rounded-xl light"
            style={{
              transformOrigin: 'center center',
              colorScheme: 'light',
              filter: 'none',
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
            <iframe
              ref={iframeRef}
              src="https://my.spline.design/particlesbots-7HFsdWxSwiyuWxwi8RkBNbtE/"
              width="100%"
              height="100%"
              className="rounded-xl"
              style={{
                colorScheme: 'light',
                filter: 'none',
              }}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
            />
          </div>

          {/* Inner Content card overlaid on top */}
          <div className="relative z-10 w-100 text-center bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm p-8 lg:p-16">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              Trade with Machine Intelligence
            </h1>

            <p className="md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Create software leveraging large language models that can conduct
              research and trade prediction markets with superhuman ability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
