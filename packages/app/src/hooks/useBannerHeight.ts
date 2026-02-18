'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook to track banner height and set CSS custom property
 * Returns a ref to attach to the banner element
 * Only the visible banner should use this hook (only one banner visible at a time)
 */
export function useBannerHeight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const setVars = (height: number, offset: number) => {
      document.documentElement.style.setProperty(
        '--banner-height',
        `${height}px`
      );
      document.documentElement.style.setProperty(
        '--banner-offset',
        `${offset}px`
      );
    };

    const updateHeight = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const height = rect.height;

      // Compute how much of the banner is still visible in the viewport.
      // Visible height = overlap between banner and viewport.
      const viewportTop = 0;
      const viewportBottom = window.innerHeight;
      const visibleHeight = Math.max(
        0,
        Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop)
      );

      setVars(height, visibleHeight);
    };

    // Initial measurement after a brief delay to ensure element is rendered
    const timeoutId = setTimeout(() => {
      updateHeight();
    }, 0);

    // Watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    const onScroll = () => {
      updateHeight();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateHeight);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateHeight);
      // Reset to 0 when banner unmounts (only if this was the active banner)
      // Note: This will be set by the newly visible banner if one exists
      document.documentElement.style.setProperty('--banner-height', '0px');
      document.documentElement.style.setProperty('--banner-offset', '0px');
    };
  }, []);

  return ref;
}
