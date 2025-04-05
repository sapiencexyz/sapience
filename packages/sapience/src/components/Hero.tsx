'use client';

import { Button } from '@foil/ui/components/ui/button';
import Link from 'next/link';

export default function Hero() {
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center w-full">
      {/* Spline embed background - made larger than viewport */}
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: 0.5,
          transform: 'translate(50%, -50%) scale(3.3)',
          transformOrigin: 'center center',
        }}
      >
        <iframe
          title="art"
          src="https://my.spline.design/particles-672e935f9191bddedd3ff0105af8f117/"
          style={{ width: '100%', height: '100%', border: 'none' }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
      </div>

      {/* Content card */}
      <div className="z-10 w-full max-w-4xl px-4 sm:px-6">
        <div className="w-full text-center px-6 sm:px-8 py-12 sm:py-16 md:py-20 bg-background/[0.015] backdrop-blur-[3px] border border-gray-500/20 rounded-xl shadow-sm">
          <h1 className="font-sans text-4xl md:text-6xl font-normal mb-6">
            The World&apos;s Frontier
            <br />
            Prediction Community
          </h1>

          <p className="text-xl md:text-2xl mb-16 text-muted-foreground">
            Join experts and enthusiasts forecasting the future of AI,
            <br />
            Biosecurity, Climate Change, International Relations, and more.
          </p>

          <Button asChild size="lg" className="px-8 py-6 text-lg">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
