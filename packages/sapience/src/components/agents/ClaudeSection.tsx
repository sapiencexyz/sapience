'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import ClaudeVideoPlayer from './ClaudeVideoPlayer';

// MCP Section with more details
export default function MCPSection() {
  return (
    <section className="pt-16 pb-32 px-4 sm:px-6 w-full relative z-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12">
          {/* Left column with text content */}
          <div className="w-full lg:w-1/2 mb-8 lg:mb-0 order-2 lg:order-1">
            <div className="lg:max-w-[490px] lg:mx-auto space-y-4 lg:space-y-6">
              <h2 className="font-sans text-2xl lg:text-3xl font-normal">
                Use Sapience with Claude
              </h2>

              <p className="text-lg text-muted-foreground">
                Give{' '}
                <Link
                  href="https://claude.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Claude
                </Link>{' '}
                tools to query the Sapience API for live data, prepare
                transaction data for prediction markets, and more.
              </p>

              <div className="pt-2">
                <Link
                  href="https://docs.sapience.xyz/mcp/use-with-claude"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="sm:w-auto">
                    <Plus className="h-4 w-4" />
                    Add to Claude
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Right column for image/video */}
          <div className="w-full lg:w-1/2 flex items-center justify-center order-1 lg:order-2">
            <ClaudeVideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
