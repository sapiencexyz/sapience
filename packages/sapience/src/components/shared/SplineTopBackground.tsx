'use client';

import { useEffect, useRef } from 'react';

type SplineTopBackgroundProps = {
  /**
   * If true, renders a subtle left gradient fade (matches Settings/Vaults).
   * Enabled by default to keep visual parity with existing pages using this effect.
   */
  showLeftGradient?: boolean;
  /**
   * If true, renders a soft top fade to transparent to reduce perceived dark banding under dense UIs.
   */
  showTopFade?: boolean;
  /**
   * Optional class overrides appended to the container to tweak transforms/opacity per page.
   * Later classes win in Tailwind, so these can override defaults.
   */
  containerClassName?: string;
  /**
   * Opacity applied to the Spline iframe content. Defaults to 0.33.
   */
  iframeOpacity?: number;
  /**
   * Optional blend-mode classes applied to the container (e.g. "dark:mix-blend-screen").
   */
  blendClassName?: string;
  /**
   * Optional scene URL to allow swapping scenes per page/context.
   */
  sceneUrl?: string;
  /**
   * If true, removes the default flip/translate so callers can fully control transform via containerClassName.
   */
  disableDefaultTransform?: boolean;
  /**
   * If true, removes the default container opacity classes so callers can fully control via containerClassName and/or iframeOpacity.
   */
  disableDefaultOpacity?: boolean;
};

const SplineTopBackground = ({
  showLeftGradient = true,
  showTopFade = false,
  containerClassName,
  iframeOpacity = 0.33,
  blendClassName,
  sceneUrl = 'https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/',
  disableDefaultTransform = false,
  disableDefaultOpacity = false,
}: SplineTopBackgroundProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force light mode rendering within the iframe for consistent visuals
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch {
          // silently ignore cross-origin restrictions
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
    <div
      className={`fixed inset-0 pointer-events-none top-0 left-0 w-full h-screen ${
        disableDefaultTransform ? '' : '-scale-y-100 -translate-y-1/4'
      } ${disableDefaultOpacity ? '' : 'opacity-50 dark:opacity-75'} ${
        blendClassName ? blendClassName : ''
      } ${containerClassName ? containerClassName : ''}`}
    >
      <iframe
        ref={iframeRef}
        src={sceneUrl}
        className="w-full h-full"
        style={{
          opacity: iframeOpacity,
          border: 'none',
          colorScheme: 'light',
          filter: 'none',
        }}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
      />
      {showTopFade ? (
        <div className="absolute top-0 left-0 right-0 h-24 md:h-28 bg-gradient-to-b from-background/80 to-transparent" />
      ) : null}
      {showLeftGradient ? (
        <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
      ) : null}
    </div>
  );
};

export default SplineTopBackground;
