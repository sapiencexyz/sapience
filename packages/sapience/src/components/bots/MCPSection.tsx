'use client';

import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import Link from 'next/link';

import ClaudeVideoPlayer from './ClaudeVideoPlayer';

// MCP Section with more details
export default function MCPSection() {
  const { toast } = useToast();

  return (
    <section className="py-16 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
          {/* Left column with text content */}
          <div className="w-full md:w-1/2 mb-8 md:mb-0">
            <div className="md:max-w-[490px] space-y-6 md:mx-auto">
              <h2 className="font-sans text-2xl md:text-3xl font-normal">
                Use Sapience with Claude
              </h2>

              <p className="text-lg text-muted-foreground">
                Use Sapience&apos;s Model Context Protocol server to use large
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
                  href="https://claude.ai/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Claude Desktop
                </Link>
                .
              </p>

              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Install Sapience for Claude Desktop
                </p>
                <div className="flex items-stretch max-w-sm">
                  <div className="bg-black text-white px-4 font-mono text-sm flex items-center rounded-l-md flex-grow border border-gray-600">
                    <span>npx @sapience/agent claude-install</span>
                  </div>
                  <Button
                    size="default"
                    className="px-3 bg-black hover:bg-gray-800 text-white border border-l-0 border-gray-600 rounded-r-md flex items-center justify-center rounded-l-none"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        'npx @sapience/agent claude-install'
                      );
                      toast({
                        title: 'Copied to clipboard',
                        description: 'Go paste that bad boy in your terminal',
                        duration: 2000,
                      });
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 15 15"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                    >
                      <path
                        d="M5 2V1H10V2H5ZM4.75 0C4.33579 0 4 0.335786 4 0.75V1H3.5C2.67157 1 2 1.67157 2 2.5V12.5C2 13.3284 2.67157 14 3.5 14H11.5C12.3284 14 13 13.3284 13 12.5V2.5C13 1.67157 12.3284 1 11.5 1H11V0.75C11 0.335786 10.6642 0 10.25 0H4.75ZM11 2V2.25C11 2.66421 10.6642 3 10.25 3H4.75C4.33579 3 4 2.66421 4 2.25V2H3.5C3.22386 2 3 2.22386 3 2.5V12.5C3 12.7761 3.22386 13 3.5 13H11.5C11.7761 13 12 12.7761 12 12.5V2.5C12 2.22386 11.7761 2 11.5 2H11Z"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Button>
                </div>
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
