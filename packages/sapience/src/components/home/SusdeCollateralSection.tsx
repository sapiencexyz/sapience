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
          <div className="w-full lg:w-2/5 mb-8 lg:mb-0 order-2 lg:order-2 lg:max-w-[400px]">
            <div className="mb-4">
              <Image
                src="/ethena.svg"
                alt="Ethena"
                width={320}
                height={120}
                className="w-auto h-auto max-w-[160px] dark:invert"
              />
            </div>
            <div className="space-y-4 lg:space-y-6">
              <p className="text-lg text-muted-foreground">
                Trade prediction markets with Ethena&apos;s USDe, a digital
                dollar that automatically accrues rewards.
              </p>

              <div className="pt-2 gap-2 flex flex-wrap justify-start">
                <Link
                  href="https://ethena.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-auto">
                    <Image
                      src="/usde.svg"
                      alt="USDe"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Left column for image/logo */}
          <div className="w-full lg:w-3/5 lg:max-w-[472px] flex items-center justify-center order-1">
            <div className="flex items-center justify-center w-full rounded-lg border shadow-inner overflow-hidden">
              <video
                src="/ethena.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="object-cover w-full h-auto"
                aria-label="ethena"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
