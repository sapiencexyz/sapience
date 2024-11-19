'use client';

import Spline from '@splinetool/react-spline';
import { MoveLeftIcon, MoveRightIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useMediaQuery } from 'usehooks-ts';

const slides = [
  {
    title: 'Liquidity providers can earn yield on their liquid staking tokens',
    scene: 'https://prod.spline.design/5aaP9EfPgQReptDE/scene.splinecode',
    image: '/assets/howitworks1.png',
  },
  {
    title:
      'Buyers purchase subscriptions and profit when average costs increase',
    scene: 'https://prod.spline.design/rFtuFMkIkTJ7Cs5A/scene.splinecode',
    image: '/assets/howitworks2.png',
  },
  {
    title: 'Paymasters and roll-ups can offer fixed costs to users',
    scene: 'https://prod.spline.design/BBIcMw9OjhboBEjl/scene.splinecode',
    image: '/assets/howitworks3.png',
  },
];

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

export const HowItWorks = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useIsInViewport(containerRef);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-[500px] w-full flex-col items-center border-b border-t border-border bg-black md:h-[800px]"
    >
      <div className="absolute inset-4 z-[2] md:inset-14">
        <div className="relative h-full w-full overflow-hidden rounded-4xl border border-border">
          <div className="absolute inset-0 bg-[url('../../../public/assets/dotgrid.svg')] bg-[length:45px_45px] bg-repeat opacity-[0.33]" />
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 z-10 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <div className="inline-block rounded-4xl border border-border bg-white px-8 py-2.5">
          <h2 className="text-lg font-semibold">How It Works</h2>
        </div>

        <motion.h1
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.8,
            ease: 'easeInOut',
          }}
          className="relative w-full max-w-[1700px] px-8 py-5 text-center text-2xl font-bold text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:mt-8 md:px-20 md:text-6xl md:leading-loose md:tracking-wide"
        >
          {slides[currentSlide].title}
        </motion.h1>
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {slides.map((slide, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: isInView && index === currentSlide ? 1 : 0 }}
            transition={{
              duration: 0.8,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'block',
              height: '100%',
            }}
          >
            <motion.div
              initial={{ scale: 1.1 }}
              animate={{ scale: isInView ? 1 : 1.1 }}
              transition={{
                duration: 1,
                ease: 'easeOut',
              }}
              style={{
                height: '100%',
              }}
            >
              {!isDesktop ? (
                <Image
                  src={slide.image}
                  alt={slide.title}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <Spline
                  className="!block h-full w-full object-cover"
                  scene={slide.scene}
                />
              )}
            </motion.div>
          </motion.div>
        ))}
      </div>

      <div className="absolute bottom-[40px] z-10 flex items-center gap-2 rounded-3xl border border-[rgba(218,216,209,0.2)] bg-white md:bottom-[120px]">
        <button
          className="flex h-full items-center px-8 py-5"
          onClick={prevSlide}
        >
          <MoveLeftIcon className="h-6 w-6" />
        </button>
        <div className="h-[18px] w-[1px] bg-[#DAD8D1]" />
        <button
          className="flex h-full items-center px-8 py-5"
          onClick={nextSlide}
        >
          <MoveRightIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};
