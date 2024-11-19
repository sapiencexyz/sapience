'use client';

import EmailCaptureButton from '@/lib/components/EmailCaptureButton';
import Spline from '@splinetool/react-spline';
import { useMediaQuery } from 'usehooks-ts';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export const Features = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isHovered1, setIsHovered1] = useState(false);
  const [isHovered2, setIsHovered2] = useState(false);
  const [isHovered3, setIsHovered3] = useState(false);

  return (
    <div className="z-10 w-full px-4 pt-6 text-center md:px-14 md:pt-0">
      <div className="grid grid-cols-1 gap-6 md:-mt-40 md:gap-6 md:pt-12 lg:grid-cols-3">
        <div 
          className="rounded-4xl border border-border bg-white p-14 hover:bg-[#363538] transition-colors hover:border-black hover:text-white relative overflow-hidden"
          onMouseEnter={() => setIsHovered1(true)}
          onMouseLeave={() => setIsHovered1(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold">Subscribe</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Estimate usage and hedge transaction costs.
            </div>
            <EmailCaptureButton>Subscribe</EmailCaptureButton>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered1 && (
                <motion.div 
                  className="absolute inset-x-0 top-1/2 bottom-0 w-full h-full"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Spline scene="https://prod.spline.design/7JZzAjAE4Qn13sVS/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        <div 
          className="rounded-4xl border border-border bg-white p-14 hover:bg-[#EFDED2] transition-colors relative overflow-hidden"
          onMouseEnter={() => setIsHovered2(true)}
          onMouseLeave={() => setIsHovered2(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold text-primary">Trade</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Buy and sell exposure to gas and blob prices.
            </div>
            <EmailCaptureButton>Trade</EmailCaptureButton>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered2 && (
                <motion.div 
                  className="absolute inset-x-0 top-1/2 bottom-0 w-full h-full"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Spline scene="https://prod.spline.design/UeFGrlFVniWxvAFh/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        <div 
          className="rounded-4xl border border-border bg-white p-14 hover:bg-[#8D895E] transition-colors relative overflow-hidden"
          onMouseEnter={() => setIsHovered3(true)}
          onMouseLeave={() => setIsHovered3(false)}
        >
          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold text-primary">Earn</h2>
            <div className="mx-auto mb-7 max-w-56 text-xl">
              Provide liquidity and boost LST yield.
            </div>
            <EmailCaptureButton>Earn</EmailCaptureButton>
          </div>
          {isDesktop && (
            <AnimatePresence>
              {isHovered3 && (
                <motion.div 
                  className="absolute inset-x-0 top-1/2 bottom-0 w-full h-full"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Spline scene="https://prod.spline.design/kve56rmjyCpgEW3G/scene.splinecode" />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};