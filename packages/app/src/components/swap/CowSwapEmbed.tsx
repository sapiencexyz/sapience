'use client';

import { useEffect, useRef } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';

export function CowSwapEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let observer: MutationObserver | undefined;
    let widget: { destroy?: () => void } | undefined;

    import('@cowprotocol/widget-lib').then(
      ({ createCowSwapWidget, TradeType }) => {
        if (cancelled || !containerRef.current) return;

        widget = createCowSwapWidget(containerRef.current, {
          params: {
            appCode: 'Sapience',
            width: '100%',
            height: '660px',
            chainId: 42161,
            tradeType: TradeType.SWAP,
            sell: { asset: '' },
            buy: { asset: 'USDC' },
            theme: 'dark',
            hideNetworkSelector: true,
            tokenLists: [`${API_URL}/tokenlist.json`],
          },
        });

        // The iframe's internal page has a white background we can't control
        // (cross-origin). Offset the iframe so the white edges are cropped.
        const styleIframe = () => {
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe) {
            iframe.style.margin = '-12px -12px -45px -12px';
            iframe.style.width = 'calc(100% + 24px)';
            iframe.style.minWidth = 'calc(100% + 24px)';
            iframe.setAttribute('width', '100%');
          }
        };
        styleIframe();
        observer = new MutationObserver(styleIframe);
        observer.observe(containerRef.current, {
          childList: true,
          subtree: true,
        });
      }
    );

    return () => {
      cancelled = true;
      observer?.disconnect();
      widget?.destroy?.();
    };
  }, []);

  return (
    <div className="rounded-xl border border-border/40 bg-[#0A0A0A] p-6 overflow-hidden">
      <div ref={containerRef} className="overflow-hidden rounded-lg" />
    </div>
  );
}
