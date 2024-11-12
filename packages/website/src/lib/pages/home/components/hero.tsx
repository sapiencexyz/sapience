'use client';

import Blob from '@/lib/components/Blob';
import { useScroll, motion, useTransform } from 'framer-motion';

export const Hero = () => {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '200%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.25]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden border-b border-border">
      <motion.div
        className="relative z-[2] mx-auto flex min-h-[100dvh] w-full flex-col items-center justify-center gap-3 px-4 text-center md:gap-7"
        style={{ opacity }}
      >
        <h1 className="text-3xl font-bold text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-6xl">
          Gas and Blobspace with Stable Pricing
        </h1>
        <h2 className="mb-0 text-lg font-semibold text-white drop-shadow-[1px_1px_3px_rgba(0,0,0,0.75)] md:text-3xl">
          Lock in your onchain costs regardless of network congestion
        </h2>
      </motion.div>

      <div className="absolute left-0 top-0 z-[2] h-[100dvh] w-[100dvw] bg-[url('../../../public/assets/dotgrid.svg')] bg-[length:45px_45px] bg-repeat opacity-[0.33]" />

      <motion.div
        className="absolute left-0 top-0 z-[1] h-[100dvh] w-full"
        style={{ y, opacity }}
      >
        <Blob />
      </motion.div>
    </div>
  );
};
