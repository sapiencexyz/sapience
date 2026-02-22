'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import PulsingGradient from '../../shared/PulsingGradient';

export default function Features() {
  return (
    <section className="relative isolate w-full pt-0 pb-16 md:pt-0 md:pb-20 overflow-hidden">
      <PulsingGradient
        className="hidden md:block right-[-30%] top-1/2 -translate-y-1/2 h-[120%] w-[100%] -z-10"
        durationMs={9600}
        gradient={
          'radial-gradient(ellipse 50% 80% at 100% 50%, #E5D7C1 0%, #CBB892 35%, #7A6A47 70%, #151513 100%)'
        }
      />
      <PulsingGradient
        className="md:hidden left-1/2 -translate-x-1/2 bottom-[-20%] h-[60%] w-[160%] -z-10"
        durationMs={9600}
        gradient={
          'radial-gradient(ellipse 60% 60% at 50% 100%, #E5D7C1 0%, #CBB892 35%, #7A6A47 70%, #151513 100%)'
        }
      />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 space-y-16 md:space-y-20">
        <div className="space-y-3">
          <div className="eyebrow text-foreground">FORECASTING AGENTS</div>
          <p className="headline max-w-5xl">
            <a href="/bots" className="gold-link">
              Deploy a forecasting agent
            </a>{' '}
            without writing code and track its accuracy on the leaderboard. Use
            AI-powered code editors to give it your own edge.{' '}
          </p>
        </div>

        <div className="space-y-3">
          <div className="eyebrow text-foreground">LIQUIDITY VAULTS</div>
          <p className="headline max-w-5xl">
            Deposit collateral into{' '}
            <a href="/vaults" className="gold-link">
              vaults
            </a>
            , allowing agents built by others to deploy this capital in
            prediction markets autonomously.
          </p>
        </div>

        <div className="space-y-3">
          <div className="eyebrow text-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            SECONDARY SALES
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono border-foreground/40 bg-foreground/10 text-foreground tracking-normal"
            >
              COMING SOON
            </Badge>
          </div>
          <p className="headline max-w-5xl">
            Trade prediction market positions using{' '}
            <a
              href="https://cow.fi"
              target="_blank"
              rel="noreferrer"
              className="gold-link"
            >
              CoW Swap
            </a>
            . Exit positions early or acquire exposure to prediction markets
            using nearly any asset.
          </p>
        </div>
      </div>
    </section>
  );
}
