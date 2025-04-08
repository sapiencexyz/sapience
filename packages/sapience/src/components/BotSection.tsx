'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Bot } from 'lucide-react';
import Link from 'next/link';

export default function BotSection() {
  return (
    <section className="pt-48 pb-24 px-8 bg-secondary/10">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row items-start gap-8">
          {/* Text content */}
          <div className="flex-1 lg:max-w-[560px]">
            <h2 className="text-3xl font-heading font-normal mb-6">
              Use Sapience with Claude
            </h2>
            <p className="text-lg mb-4">
              Sapience&apos;s{' '}
              <strong className="font-medium">model context protocol</strong>{' '}
              server is a plug-in for Claude. Have Claude check active
              prediction markets, research them, and stage transactions to a{' '}
              <Link
                target="_blank"
                className="underline"
                href="https://safe.global"
              >
                Safe
              </Link>{' '}
              for you.
            </p>

            <p className="text-lg mb-4">
              Or build an autonomous agent to research and update market
              positions on your behalf.
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

          {/* Visual content */}
          <div className="flex-1 flex items-center justify-center p-8 bg-background rounded-lg border border-border">
            {/* Placeholder for Claude image or video */}
            <div className="text-center p-8">
              <Bot className="h-16 w-16 mx-auto text-primary/60 mb-2" />
              <p className="text-muted-foreground">
                Claude Desktop Integration Video Coming Soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
