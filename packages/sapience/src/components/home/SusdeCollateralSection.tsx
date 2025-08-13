'use client';

import { Button } from '@sapience/ui/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';

export default function SusdeCollateralSection() {
  return (
    <section className="pt-8 lg:pt-12 pb-12 lg:pb-24 px-4 sm:px-6 w-full relative z-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center lg:justify-center gap-8 lg:gap-20">
          {/* Right column with text content */}
          <div className="w-full lg:w-2/5 mb-8 lg:mb-0 order-2 lg:order-2 lg:max-w-[380px]">
            <h2 className="font-sans text-2xl lg:text-3xl font-normal mb-4">
              Reward-Bearing Collateral
            </h2>
            <div className="space-y-4 lg:space-y-6">
              <p className="text-lg text-muted-foreground">
                <Link
                  href="https://ethena.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  Ethena
                </Link>
                &apos;s sUSDe token reduces opportunity cost when participating
                in prediction markets, improving their accuracy.
              </p>

              <div className="pt-2 gap-2 flex flex-wrap justify-start">
                <Link
                  href="https://docs.ethena.fi/solution-overview/protocol-revenue-explanation"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-auto">
                    <Image
                      src="/ethena-icon.svg"
                      alt="Ethena"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    Learn More
                  </Button>
                </Link>
                <Link
                  href="https://swap.defillama.com/?chain=ethereum&tab=swap&to=0x9d39a5de30e57443bff2a8307a4256c8797a3497"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 sm:ml-5"
                >
                  <Button variant="outline" className="w-auto">
                    <Image
                      src="/susde-icon.svg"
                      alt="sUSDe"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    Get sUSDe
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Left column for image/logo */}
          <div className="w-full lg:w-3/5 lg:max-w-[472px] flex items-center justify-center order-1">
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
