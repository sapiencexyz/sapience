'use client';

import { Button } from '@foil/ui/components/ui/button';
import Link from 'next/link';

import ClaudeVideoPlayer from '../bots/ClaudeVideoPlayer';

export default function BotSection() {
  return (
    <section className="pt-48 pb-24 px-8 bg-secondary/10">
      <div className="container mx-auto">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
          {/* Text content */}
          <div className="lg:w-2/3 flex flex-col items-center justify-center">
            <div className="lg:max-w-[520px]">
              <h2 className="text-3xl font-heading font-normal mb-6">
                Use Sapience with Claude
              </h2>
              <p className="text-lg mb-4">
                Sapience&apos;s{' '}
                <strong className="font-medium">model context protocol</strong>{' '}
                server is a plug-in for Claude. Have Claude check active
                prediction markets, research them, and generate transaction data
                you can use onchain.
              </p>

              <p className="text-lg mb-4">
                You can also build an autonomous agent to research and update
                market positions on your behalf.
              </p>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="mt-4 rounded-full"
              >
                <Link href="/bots">Learn more</Link>
              </Button>
            </div>
          </div>

          {/* Video Player */}
          <div className="lg:w-1/2 flex items-center justify-center lg:p-8">
            <ClaudeVideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
