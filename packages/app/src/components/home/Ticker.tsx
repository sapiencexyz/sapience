'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';
import { useConditions } from '~/hooks/graphql/useConditions';
import { hasActivePublicConditions } from './featuredConditions';

export default function Ticker() {
  const { data: conditions } = useConditions({ take: 100 });
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const nowSeconds = React.useMemo(() => Date.now() / 1000, []);
  const hasItems = hasActivePublicConditions(conditions, nowSeconds);

  // Expose current ticker height so pages can reserve space only when needed.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const measured = el.offsetHeight || 40;
      const nextHeight = `${measured}px`;
      document.documentElement.style.setProperty('--ticker-height', nextHeight);
    };

    setHeightVar();

    const resizeObserver = new ResizeObserver(setHeightVar);
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty('--ticker-height', '0px');
    };
  }, [hasItems]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-0 left-0 right-0 z-[45] w-full overflow-hidden bg-brand-black border-y border-brand-white/10 text-foreground h-[40px] min-h-[40px]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: hasItems ? 1 : 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="h-full flex items-center"
      >
        <FeaturedMarketGroupCards />
      </motion.div>
    </div>
  );
}
