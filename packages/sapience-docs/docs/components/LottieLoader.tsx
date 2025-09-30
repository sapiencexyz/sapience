'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

interface LottieLoaderProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  invertOnDark?: boolean;
}

const LottieLoader = ({
  className = '',
  width = 24,
  height = 24,
  invertOnDark = true,
}: LottieLoaderProps) => {
  const [LottieView, setLottieView] = useState<ReactElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const loadLottie = async () => {
      try {
        const { useLottie } = await import('lottie-react');

        const options = {
          animationData: undefined,
          path: '/lottie/loader.json',
          loop: true,
          autoplay: true,
          className,
          style: {
            width,
            height,
          },
        } as const;

        const LottieComponent = () => {
          const { View } = useLottie(options);
          return (
            <span
              className={`inline-flex items-center align-middle whitespace-nowrap ${className}`}
              style={{
                width,
                height,
                filter: invertOnDark && isDark ? 'invert(1) hue-rotate(180deg)' : 'none',
              }}
            >
              {View}
            </span>
          );
        };

        setLottieView(<LottieComponent />);
        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load lottie-react:', error);
        setIsLoaded(true);
      }
    };

    loadLottie();
  }, [className, width, height]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;

    const compute = () => {
      const dark =
        root?.dataset?.theme === 'dark' ||
        root?.classList?.contains('dark') ||
        body?.dataset?.theme === 'dark' ||
        body?.classList?.contains('dark');
      setIsDark(Boolean(dark));
    };

    compute();

    const observer = new MutationObserver(compute);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (body) observer.observe(body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => observer.disconnect();
  }, []);

  if (!isLoaded || !LottieView) {
    return (
      <span
        className={`inline-block ${className}`}
        style={{
          width,
          height,
          filter: invertOnDark && isDark ? 'invert(1) hue-rotate(180deg)' : 'none',
        }}
      />
    );
  }

  return LottieView;
};

export default LottieLoader;


