'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

interface LottieLoaderProps {
  className?: string;
  width?: number;
  height?: number;
}

const LottieLoader = ({
  className = '',
  width = 24,
  height = 24,
}: LottieLoaderProps) => {
  const [LottieView, setLottieView] = useState<ReactElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Dynamically import lottie-react only on the client side
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
        };

        // We can't use the hook directly here since we're in an effect
        // Instead, we'll create a wrapper component
        const LottieComponent = () => {
          const { View } = useLottie(options);
          return (
            <span
              className={`inline-flex items-center align-middle whitespace-nowrap dark:invert ${className}`}
              style={{ width, height }}
            >
              {View}
            </span>
          );
        };

        setLottieView(<LottieComponent />);
        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load lottie-react:', error);
        setIsLoaded(true); // Still set loaded to show fallback
      }
    };

    loadLottie();
  }, [className, width, height]);

  // Return fallback during SSR and while loading
  if (!isLoaded || !LottieView) {
    return (
      <span className={`inline-block ${className}`} style={{ width, height }} />
    );
  }

  return LottieView;
};

export default LottieLoader;
