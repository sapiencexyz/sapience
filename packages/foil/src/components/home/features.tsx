'use client';

import Spline from '@splinetool/react-spline';
import { useMediaQuery } from 'usehooks-ts';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export const Features = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isHovered1, setIsHovered1] = useState(false);
  const [isHovered2, setIsHovered2] = useState(false);
  const [isHovered3, setIsHovered3] = useState(false);

  return (
    <div className="z-10 w-full px-4 pt-6 text-center md:px-14 md:pt-0">
      <div className="grid grid-cols-1 gap-6 md:-mt-40 md:gap-6 md:pt-12 lg:grid-cols-3">
        <div
          className="relative overflow-hidden rounded-4xl border border-border bg-white p-14 transition-all hover:bg-[#363538] hover:text-white"
          onMouseEnter={() => setIsHovered1(true)}
          onMouseLeave={() => setIsHovered1(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold">Subscribe</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Estimate usage and hedge transaction costs.
            </div>

            <Button asChild className="rounded-2xl p-6 font-semibold">
              <a href="https://www.sapience.xyz/subscribe">Subscribe</a>
            </Button>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered1 && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 top-1/2 h-full w-full"
                  initial={{ opacity: 0, y: 20, scale: 1.4 }}
                  animate={{ opacity: 1, y: 0, scale: 1.5 }}
                  exit={{ opacity: 0, y: 20, scale: 1.4 }}
                  transition={{
                    ease: 'easeOut',
                    delay: 2,
                    duration: 0.3,
                  }}
                >
                  <Spline scene="https://prod.spline.design/7JZzAjAE4Qn13sVS/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        <div
          className="relative overflow-hidden rounded-4xl border border-border bg-white p-14 transition-all hover:bg-[#EFDED2]"
          onMouseEnter={() => setIsHovered2(true)}
          onMouseLeave={() => setIsHovered2(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold text-primary">Trade</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Buy and sell exposure to gas and blob prices.
            </div>

            <Button asChild className="rounded-2xl p-6 font-semibold">
              <a href="https://www.sapience.xyz/markets/8453:0x20ba5e24ad8a5b9502d4882607f0c8526a1f3205/periods/1/trade">
                Trade
              </a>
            </Button>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered2 && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 top-1/2 h-full w-full"
                  initial={{ opacity: 0, y: -30, scale: 1.4, x: 70 }}
                  animate={{ opacity: 1, y: -50, scale: 1.5, x: 70 }}
                  exit={{ opacity: 0, y: -30, scale: 1.4, x: 70 }}
                  transition={{
                    ease: 'easeOut',
                    delay: 2,
                    duration: 0.3,
                  }}
                >
                  <Spline scene="https://prod.spline.design/UeFGrlFVniWxvAFh/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        <div
          className="relative overflow-hidden rounded-4xl border border-border bg-white p-14 transition-all hover:bg-[#8D895E] hover:text-white"
          onMouseEnter={() => setIsHovered3(true)}
          onMouseLeave={() => setIsHovered3(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold">Earn</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Provide liquidity and boost LST yield.
            </div>

            <Button asChild className="rounded-2xl p-6 font-semibold">
              <a href="https://www.sapience.xyz/earn/ethereum-gas">Earn</a>
            </Button>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered3 && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 top-1/2 h-full w-full"
                  initial={{ opacity: 0, y: 20, scale: 1.4 }}
                  animate={{ opacity: 1, y: 0, scale: 1.5 }}
                  exit={{ opacity: 0, y: 20, scale: 1.4 }}
                  transition={{
                    ease: 'easeOut',
                    delay: 2,
                    duration: 0.3,
                  }}
                >
                  <Spline scene="https://prod.spline.design/7CmxSKnIOio6fOz8/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};
