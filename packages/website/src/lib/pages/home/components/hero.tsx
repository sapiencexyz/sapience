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
      className="relative h-[1000px] w-full overflow-hidden"
    >
      <motion.div
        className="relative z-[2] mx-auto flex min-h-[1000px] w-full max-w-screen-md flex-col items-center gap-3 px-4 pt-60 text-center md:gap-4"
        style={{ opacity }}
      >
        <h1 className="text-5xl font-bold text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-6xl md:leading-loose md:tracking-wide">
          Gas and Blobspace with Stable Pricing
        </h1>
        <h2 className="mb-0 max-w-xl px-4 text-lg font-medium text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-3xl">
          Lock in your onchain costs regardless of network congestion
        </h2>
      </motion.div>

      <div className="absolute left-0 top-0 z-[2] h-[1000px] w-[100dvw] bg-[url('../../../public/assets/dotgrid.svg')] bg-[length:45px_45px] bg-repeat opacity-[0.33]" />

      <motion.div
        className="absolute left-0 top-0 z-[1] h-[1000px] w-full"
        style={{ y, opacity }}
      >
        <div className="h-[1000px] scale-150 opacity-90">
          {isInView && (
            <Spline scene="https://prod.spline.design/gyoZ1cjoFk5-20wQ/scene.splinecode" />
          )}
        </div>
      </motion.div>
    </div>
  );
};
