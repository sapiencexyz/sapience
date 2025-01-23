'use client';

import { useScroll, motion, useTransform } from 'framer-motion';
import Spline from '@splinetool/react-spline';
import { useState, useRef, useEffect } from 'react';

function useIsInViewport(ref: React.RefObject<HTMLElement>) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return isIntersecting;
}

export const Hero = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useIsInViewport(containerRef);
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '200%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.25]);

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full overflow-hidden md:h-[1000px]"
    >
      <motion.div
        className="relative z-[2] mx-auto flex min-h-[100dvh] w-full max-w-screen-md flex-col items-center gap-3 px-4 pt-60 text-center md:h-[1000px] md:gap-4"
        style={{ opacity }}
      >
        <h1 className="text-4xl font-bold leading-tight text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-6xl md:leading-loose md:tracking-wide">
          Gas and Blobspace with Stable Pricing
        </h1>
        <h2 className="mb-0 max-w-xl px-4 text-lg font-medium text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-3xl">
          Lock in your onchain costs regardless of network congestion
        </h2>
      </motion.div>

      <div className="absolute left-0 top-0 z-[2] h-[100dvh] w-[100dvw] bg-[url('../../../public/assets/dotgrid.svg')] bg-[length:45px_45px] bg-repeat opacity-[0.33] md:h-[1000px]" />

      <div className="absolute bottom-0 left-0 z-[2] h-[140px] w-full bg-gradient-to-b from-transparent to-white" />

      <motion.div
        className="absolute left-0 top-0 z-[1] h-[100dvh] w-full md:h-[1000px]"
        style={{ y, opacity }}
      >
        <div className="h-[100dvh] scale-150 opacity-90 md:h-[1000px]">
          {isInView && (
            <Spline scene="https://prod.spline.design/gyoZ1cjoFk5-20wQ/scene.splinecode" />
          )}
        </div>
      </motion.div>
    </div>
  );
};
