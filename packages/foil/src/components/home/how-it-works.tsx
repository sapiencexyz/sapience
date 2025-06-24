'use client';

import { MoveLeftIcon, MoveRightIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useMediaQuery } from 'usehooks-ts';

const slides = [
  {
    title: 'Liquidity providers can earn yield on their liquid staking tokens',
    videoLg: '/videos/How-It-Works/How-It-Works-1/Foil-How-It-Works-1-LG.mp4',
    videoSm: '/videos/How-It-Works/How-It-Works-1/Foil-How-It-Works-1-SM.mp4',
    image: '/assets/howitworks1.png',
  },
  {
    title:
      'Buyers purchase subscriptions and profit when average costs increase',
    videoLg: '/videos/How-It-Works/How-It-Works-2/Foil-How-It-Works-2-LG.mp4',
    videoSm: '/videos/How-It-Works/How-It-Works-2/Foil-How-It-Works-2-SM.mp4',
    image: '/assets/howitworks2.png',
  },
  {
    title: 'Paymasters and roll-ups can offer fixed costs to users',
    videoLg: '/videos/How-It-Works/How-It-Works-3/Foil-How-It-Works-3-LG.mp4',
    videoSm: '/videos/How-It-Works/How-It-Works-3/Foil-How-It-Works-3-SM.mp4',
    image: '/assets/howitworks3.png',
  },
];

function useIsInViewport(ref: React.RefObject<HTMLElement | null>) {
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
  const [activeButton, setActiveButton] = useState<'left' | 'right' | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useIsInViewport(containerRef);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  useEffect(() => {
    // Reset and play the current video when slide changes
    videoRefs.current.forEach((video, index) => {
      if (video) {
        if (index === currentSlide) {
          video.currentTime = 0;
          video.play();
        }
      }
    });
  }, [currentSlide]);

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
                <video
                  ref={(el) => {
                    videoRefs.current[index] = el;
                  }}
                  autoPlay={index === currentSlide}
                  muted
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                  src={slide.videoSm}
                />
              ) : (
                isInView && (
                  <video
                    ref={(el) => {
                      videoRefs.current[index] = el;
                    }}
                    autoPlay={index === currentSlide}
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                    src={slide.videoLg}
                  />
                )
              )}
            </motion.div>
          </motion.div>
        ))}
      </div>

      <div
        className="absolute bottom-[40px] z-10 md:bottom-[120px]"
        style={{ perspective: '800px' }}
      >
        <motion.div
          className="flex items-center rounded-3xl border border-[rgba(218,216,209,0.2)] bg-white md:gap-2"
          style={{
            transformOrigin: '50% 50%',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
          }}
          animate={{
            rotateY:
              activeButton === 'left' ? -7 : activeButton === 'right' ? 7 : 0,
            boxShadow: activeButton
              ? '0px 8px 16px rgba(0,0,0,0.15)'
              : '0px 2px 4px rgba(0,0,0,0.1)',
            y: activeButton ? 1 : 0,
            scale: activeButton ? 0.985 : 1,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <button
            className="flex h-full items-center px-4 py-2.5 transition-all hover:opacity-50 md:px-8 md:py-5"
            onClick={prevSlide}
            onMouseDown={() => setActiveButton('left')}
            onMouseUp={() => setActiveButton(null)}
            onMouseLeave={() => setActiveButton(null)}
          >
            <MoveLeftIcon className="h-3 w-3 md:h-6 md:w-6" />
          </button>
          <div className="h-[18px] w-[1px] bg-[#DAD8D1]" />
          <button
            className="flex h-full items-center px-4 py-2.5 transition-all hover:opacity-50 md:px-8 md:py-5"
            onClick={nextSlide}
            onMouseDown={() => setActiveButton('right')}
            onMouseUp={() => setActiveButton(null)}
            onMouseLeave={() => setActiveButton(null)}
          >
            <MoveRightIcon className="h-3 w-3 md:h-6 md:w-6" />
          </button>
        </motion.div>
      </div>
    </div>
  );
};
