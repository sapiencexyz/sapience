'use client';

import { useEffect, useRef, useState } from 'react';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PulsingGradient from '~/components/shared/PulsingGradient';

export default function BotsHero() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Try to ensure autoplay starts even if the browser blocks the initial attempt
    const attemptPlay = () => {
      const playPromise = v.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          // ignore autoplay rejection; user interaction will start playback
        });
      }
    };

    if (v.readyState >= 2) {
      attemptPlay();
      setIsVideoReady(true);
    } else {
      const onCanPlay = () => {
        attemptPlay();
        setIsVideoReady(true);
        v.removeEventListener('canplay', onCanPlay);
      };
      v.addEventListener('canplay', onCanPlay);
      return () => v.removeEventListener('canplay', onCanPlay);
    }
  }, []);

  const handleScrollClick = () => {
    const viewportHeight =
      (window as any).visualViewport?.height ?? window.innerHeight;
    const offset = Math.max(viewportHeight - 100, 0);
    window.scrollBy({ top: offset, behavior: 'smooth' });
  };

  return (
    <section
      className="relative isolate flex flex-col w-full overflow-hidden"
      style={{
        // Reserve space for banner/header and keep hero within the viewport
        minHeight: 'calc(100dvh - var(--page-top-offset, 0px))',
        paddingBlock: 'clamp(16px, 3vw, 32px)',
      }}
    >
      <HeroBackgroundLines />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 py-4 md:py-6 lg:py-8 flex-1 flex flex-col justify-center items-center">
        <div className="relative z-10 w-full flex flex-col items-center">
          <div
            className={`relative w-full max-w-[300px] md:max-w-[300px] lg:max-w-[340px] xl:max-w-[380px] 2xl:max-w-[420px] aspect-[3/2] rounded-2xl border border-[hsl(var(--accent-gold)/0.2)] ring-1 ring-[hsl(var(--accent-gold)/0.12)] shadow-[0_0_16px_hsl(var(--accent-gold)/0.1)] drop-shadow-[0_0_8px_hsl(var(--accent-gold)/0.16)] mb-6 md:mb-8 overflow-hidden transition-opacity duration-500 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <PulsingGradient
              className="inset-[-10px] rounded-[18px] -z-10"
              durationMs={9600}
              gradient={
                'radial-gradient(ellipse 80% 90% at 50% 50%, hsl(var(--accent-gold)/0.14) 0%, hsl(var(--accent-gold)/0.06) 45%, transparent 70%)'
              }
            />
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onLoadedData={() => setIsVideoReady(true)}
            >
              <source src="/hero_bot.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="w-full md:w-auto max-w-[300px] md:max-w-none rounded-2xl md:rounded-[20px] bg-brand-black text-foreground px-5 md:px-8 py-5 md:py-6 flex flex-col items-center text-center shadow-sm border border-border/20">
            <h1 className="font-heading text-xl leading-snug md:text-2xl md:leading-snug lg:text-2xl max-w-md">
              Build AI-powered agents that forecast the future and trade
              prediction markets
            </h1>
            <button
              type="button"
              onClick={handleScrollClick}
              className="mt-3 font-mono text-sm inline-flex items-center gap-1"
            >
              <span className="gold-link">Deploy an agent in minutes</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
