'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import ClaudeVideoPlayer from './ClaudeVideoPlayer';

// MCP Section with more details
export default function MCPSection() {
  return (
    <section className="pt-16 pb-32 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
          {/* Left column with text content */}
          <div className="w-full md:w-1/2 mb-8 md:mb-0">
            <div className="md:max-w-[490px] space-y-6 md:mx-auto">
              <h2 className="font-sans text-2xl md:text-3xl font-normal">
                Use Sapience with Claude
              </h2>

              <p className="text-lg text-muted-foreground">
                Add Sapience&apos;s Model Context Protocol server to use large
                language models with predictions markets. Connect to any{' '}
                <Link
                  href="https://modelcontextprotocol.io/clients"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  MCP client
                </Link>
                , including{' '}
                <Link
                  href="https://claude.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Claude
                </Link>
                .
              </p>

              <div className="pt-2">
                <Link
                  href="https://docs.sapience.xyz/api/mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-full sm:w-auto">
                    <Plus className="h-4 w-4" />
                    Add to Claude
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Right column for image/video */}
          <div className="w-full md:w-1/2 flex items-center justify-center">
            <ClaudeVideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
