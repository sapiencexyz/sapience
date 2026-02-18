'use client';

import { useEffect, useRef, useState } from 'react';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PulsingGradient from '~/components/shared/PulsingGradient';
import Ticker from '~/components/home/Ticker';

export default function Hero() {
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

    // Manual loop to guarantee a full playthrough before restarting
    const onEnded = () => {
      v.currentTime = 0;
      attemptPlay();
    };
    v.addEventListener('ended', onEnded);

    let cleanupCanPlay: (() => void) | null = null;
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
      cleanupCanPlay = () => v.removeEventListener('canplay', onCanPlay);
    }

    return () => {
      v.removeEventListener('ended', onEnded);
      if (cleanupCanPlay) cleanupCanPlay();
    };
  }, []);
  return (
    <section className="relative isolate flex flex-col w-full overflow-hidden min-h-[calc(100dvh-var(--page-top-offset,0px))] pb-[var(--ticker-height,0px)]">
      <HeroBackgroundLines />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 flex-1 flex flex-col justify-center gap-8 pt-6 pb-20 md:pt-8 md:pb-24">
        <div className="relative z-10 w-full flex flex-col items-center">
          <div
            className={`relative w-full max-w-[270px] md:max-w-[300px] lg:max-w-[320px] xl:max-w-[340px] 2xl:max-w-[360px] aspect-[29/25] rounded-[20px] border border-brand-white/10 shadow-none mb-6 overflow-hidden transition-opacity duration-500 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <PulsingGradient
              className="inset-[-10px] rounded-[20px] -z-10"
              durationMs={9600}
              gradient={
                'radial-gradient(ellipse 80% 90% at 50% 50%, transparent 0%, transparent 100%)'
              }
            />
            <video
              ref={videoRef}
              className="absolute left-1/2 top-0 h-full w-[138%] md:w-[155%] -translate-x-1/2 object-cover"
              autoPlay
              muted
              playsInline
              preload="auto"
              onLoadedData={() => setIsVideoReady(true)}
            >
              <source src="/hero.mp4" type="video/mp4" />
            </video>
            <div className="pointer-events-none absolute inset-0 rounded-[20px] shadow-[inset_0_0_18px_rgba(255,204,102,0.12)]" />
          </div>
          <div className="w-full md:w-auto flex flex-col items-center text-center">
            <h1 className="headline text-center max-w-[400px] mx-auto text-balance">
              Forecast the future with next-gen prediction markets
            </h1>
            <p className="mt-4 text-xs font-mono uppercase tracking-wider text-accent-gold flex items-center justify-center gap-1 md:gap-1.5 flex-wrap">
              <span>Transparent</span>
              <span className="opacity-50 mx-1.5">·</span>
              <span>Permissionless</span>
              <span className="hidden md:inline opacity-50 mx-1.5">·</span>
              {/* Force a wrap on small screens where the separator is hidden */}
              <span className="md:hidden basis-full h-0" aria-hidden="true" />
              <span>Open Source</span>
            </p>
          </div>
        </div>
      </div>
      <Ticker />
    </section>
  );
}
