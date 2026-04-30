'use client';

import * as React from 'react';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';

export default function Ticker() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Expose current ticker height so pages can reserve space.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const measured = el.offsetHeight || 40;
      document.documentElement.style.setProperty(
        '--ticker-height',
        `${measured}px`
      );
    };

    setHeightVar();

    const resizeObserver = new ResizeObserver(setHeightVar);
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty('--ticker-height', '0px');
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-0 left-0 right-0 z-[45] w-full overflow-hidden bg-brand-black border-y border-brand-white/10 text-foreground h-[40px] min-h-[40px]"
    >
      <div className="h-full flex items-center">
        <FeaturedMarketGroupCards />
      </div>
    </div>
  );
}
