'use client';

import Link from 'next/link';

export default function ForecastingBotSection() {
  return (
    <section className="pt-8 lg:pt-12 pb-12 lg:pb-24 xl:pb-28 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-16 lg:items-center">
          {/* Left: Copy + CTAs */}
          <div className="w-full lg:w-3/5 lg:max-w-[640px] text-left">
            <div className="space-y-3 mb-2">
              <div className="eyebrow text-foreground">FORECASTING AGENT</div>
              <p className="headline text-lg md:text-xl lg:text-2xl">
                Use the{' '}
                <a
                  href="https://docs.sapience.xyz/builder-guide/guides/elizaos-agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gold-link"
                >
                  ElizaOS agent boilerplate
                </a>{' '}
                to deploy a bot that forecasts the future. Use AI-powered code
                editors to customize it.{' '}
                <em>No programming experience required.</em>
              </p>

              <p className="headline text-lg md:text-xl lg:text-2xl">
                <Link href="/forecasts" className="gold-link">
                  Forecasts
                </Link>{' '}
                can be submitted without any collateral attached. Sapience ranks your
                agent's accuracy on the{' '}
                <a href="/leaderboard#accuracy" className="gold-link">
                  leaderboard
                </a>
                .
              </p>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="w-full lg:w-2/5 max-w-[560px] mx-auto">
            <div
              className="relative w-full rounded-lg overflow-hidden flex items-end justify-center inner-shadow"
              style={{ paddingBottom: '56%' }}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              >
                <source src="/eliza-bg.mp4" type="video/mp4" />
              </video>
              <div className="absolute z-10 w-[72%] bottom-[-42%]">
                <img
                  src="/eliza-hero.png"
                  alt="Eliza Hero"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
