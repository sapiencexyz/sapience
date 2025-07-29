'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function SusdeCollateralSection() {
  return (
    <section className="pt-8 lg:pt-12 pb-40 px-4 sm:px-6 w-full relative z-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12">
          {/* Left column with text content */}
          <div className="w-full lg:w-1/2 mb-8 lg:mb-0 order-2 lg:order-1">
            <div className="lg:max-w-[380px] lg:mx-auto space-y-4 lg:space-y-6">
              <h2 className="font-sans text-2xl lg:text-3xl font-normal">
                Reward-Bearing Collateral
              </h2>

              <p className="text-lg text-muted-foreground">
                Using{' '}
                <Link
                  href="https://ethena.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Ethena
                </Link>
                &apos;s staked USDe token removes opportunity cost from
                participating in prediction markets, increasing their accuracy.
              </p>

              <div className="pt-2">
                <Link
                  href="https://docs.ethena.fi/solution-overview/protocol-revenue-explanation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button className="sm:w-auto">
                    <ExternalLink className="h-4 w-4" />
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Right column for image/logo */}
          <div className="w-full lg:w-2/5 flex items-center justify-center order-1 lg:order-2">
            <div className="flex items-center justify-center w-full rounded-lg border shadow-inner overflow-hidden">
              <Image
                src="/susde.svg"
                alt="sUSDe"
                width={1080}
                height={420}
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
