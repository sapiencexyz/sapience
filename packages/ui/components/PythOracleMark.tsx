'use client';

import * as React from 'react';

export type PythOracleMarkProps = {
  className?: string;
  style?: React.CSSProperties;
  /**
   * Path to the Pyth logo in the consuming app's public assets.
   * Default matches existing usage: `/pyth-network.svg`.
   */
  src?: string;
  alt?: string;
};

/**
 * Renders the Pyth logo using CSS mask when supported (crisper, inherits currentColor),
 * falling back to an <img> otherwise.
 *
 * This is intentionally "just the mark" so it can be reused in list items, stacked icons, etc.
 */
export function PythOracleMark({
  className,
  style,
  src = '/pyth-network.svg',
  alt = 'Pyth',
}: PythOracleMarkProps) {
  const [canMask, setCanMask] = React.useState(false);
  React.useEffect(() => {
    try {
      const ok =
        typeof CSS !== 'undefined' &&
        (CSS.supports('mask-image', 'url(\"\")') ||
          CSS.supports('-webkit-mask-image', 'url(\"\")'));
      setCanMask(!!ok);
    } catch {
      setCanMask(false);
    }
  }, []);

  if (canMask) {
    return (
      <span
        aria-hidden
        className={className}
        style={{
          ...style,
          backgroundColor: 'currentColor',
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    );
  }

  return <img src={src} alt={alt} className={className} style={style} />;
}


