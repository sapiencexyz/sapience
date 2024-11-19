'use client';

import Spline from '@splinetool/react-spline';
import { MoveLeftIcon, MoveRightIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

const slides = [
  {
    title: 'Liquidity providers can earn yield on their liquid staking tokens',
    scene: 'https://prod.spline.design/5aaP9EfPgQReptDE/scene.splinecode',
  },
  {
    title:
      'Buyers purchase subscriptions and profit when average costs increase',
    scene: 'https://prod.spline.design/rFtuFMkIkTJ7Cs5A/scene.splinecode',
  },
  {
    title: 'Paymasters and roll-ups can offer fixed costs to users',
    scene: 'https://prod.spline.design/BBIcMw9OjhboBEjl/scene.splinecode',
  },
];

export const HowItWorks = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="relative flex h-[800px] w-full flex-col items-center border-b border-t border-border bg-black bg-secondary">
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
          transition={{ duration: 0.5 }}
          className="relative mt-8 w-full px-20 py-5 text-center text-4xl font-bold text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-6xl md:leading-loose md:tracking-wide"
        >
          {slides[currentSlide].title}
        </motion.h1>
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {slides.map((slide, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: index === currentSlide ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            <Spline
              className="h-full w-full object-cover"
              scene={slide.scene}
            />
          </motion.div>
        ))}
      </div>

      <div className="absolute bottom-[120px] z-10 flex items-center gap-2 rounded-3xl border border-[rgba(218,216,209,0.2)] bg-white px-8 py-5">
        <button className="h-6 w-6" onClick={prevSlide}>
          <MoveLeftIcon className="h-6 w-6" />
        </button>
        <div className="mx-4 h-[18px] w-[1px] bg-[#DAD8D1]" />
        <button className="h-6 w-6" onClick={nextSlide}>
          <MoveRightIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};
