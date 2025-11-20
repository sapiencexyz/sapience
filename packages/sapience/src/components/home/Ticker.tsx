'use client';

import * as React from 'react';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';
import { useConditions } from '~/hooks/graphql/useConditions';
import { hasActivePublicConditions } from './featuredConditions';

export default function Ticker() {
  const [isMounted, setIsMounted] = React.useState(false);
  const { data: conditions } = useConditions({ take: 100 });

  const nowSeconds = React.useMemo(() => Date.now() / 1000, []);
  const hasItems = hasActivePublicConditions(conditions, nowSeconds);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`w-full overflow-hidden ${
        hasItems ? 'h-[134px] bg-brand-black' : 'h-[2px]'
      } text-foreground transition-opacity duration-500 ease-out ${
        isMounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <FeaturedMarketGroupCards />
    </div>
  );
}
