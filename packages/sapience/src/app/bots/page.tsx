'use client';

import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import { Megaphone, Github, Search, TrendingUp, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import ClaudeVideoPlayer from '../../components/ClaudeVideoPlayer';

// Hero section for the bots page - smaller than homepage hero but still exciting
const BotsHero = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (typeof document === 'undefined') return;
    if (iframe && iframe.contentDocument) {
      const style = iframe.contentDocument.createElement('style');
      style.textContent = `
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        body { background-color: transparent; margin: 0; padding: 1rem; } /* Example: Ensure transparent background */
      `;
      iframe.contentDocument.head.appendChild(style);
    }
  }, []);

  return (
    <div className="relative overflow-hidden flex items-center justify-center w-full">
      {/* Outer container with padding and iframe background */}
      <div className="relative z-10 w-full px-6 py-36 max-w-screen-xl mx-auto">
        <div className="relative overflow-hidden rounded-xl shadow-inner">
          {/* Iframe as background within the outer box */}
          <div
            className="absolute inset-0 z-0 overflow-hidden rounded-xl light"
            style={{
              transformOrigin: 'center center',
              colorScheme: 'light',
              filter: 'none',
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
            <iframe
              ref={iframeRef}
              src="https://my.spline.design/particlesbots-7HFsdWxSwiyuWxwi8RkBNbtE/"
              width="100%"
              height="100%"
              className="rounded-xl"
              style={{
                colorScheme: 'light',
                filter: 'none',
              }}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
            />
          </div>

          {/* Inner Content card overlaid on top */}
          <div className="relative z-10 w-100 text-center bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm p-8 lg:p-24">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              Trade with Machine Intelligence
            </h1>

            <p className="md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Create software leveraging large language models that can conduct
              research and trade prediction markets with superhuman ability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// MCP Section with more details
const MCPSection = () => {
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
};

// Template section renamed to Research Bot Boilerplate
const TemplateSection = () => {
  return (
    <section id="templates" className="py-16 md:py-32 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left side: Flow chart with loop */}
          <div className="w-full md:w-1/2 p-6">
            {/* Adjusted height for mobile */}
            <div className="relative h-[300px] md:h-[400px] w-full">
              {/* Responsive large circular connecting line */}
              <div className="absolute w-[200px] h-[200px] md:w-[280px] md:h-[280px] border-2 border-muted rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

              {/* Centered Spinning Icon - size adjusted */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <RefreshCw
                  className="h-8 w-8 md:h-10 md:w-10 animate-spin opacity-20"
                  strokeWidth={1}
                  style={{ animationDuration: '8s' }}
                />
              </div>

              {/* Step 1: Research and Forecast - Top - Responsive positioning and size */}
              <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white flex items-center justify-center mb-2 md:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <Search className="h-6 w-6 md:h-8 md:w-8 text-black" />
                </div>
                <p className="text-xs md:text-sm font-medium">
                  Research and Forecast
                </p>
              </div>

              {/* Step 2: Create/Modify Market Positions - Bottom Right - Responsive positioning and size */}
              <div className="absolute bottom-[20px] right-[40px] md:bottom-[40px] md:right-[80px] text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white flex items-center justify-center mb-2 md:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-black" />
                </div>
                <p className="text-xs md:text-sm font-medium">
                  Update
                  <br />
                  Market Positions
                </p>
              </div>

              {/* Step 3: Update Prediction Journal - Bottom Left - Responsive positioning and size */}
              <div className="absolute bottom-[20px] left-[40px] md:bottom-[40px] md:left-[80px] text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white flex items-center justify-center mb-2 md:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <Megaphone className="h-6 w-6 md:h-8 md:w-8 text-black" />
                </div>
                <p className="text-xs md:text-sm font-medium">
                  Share Prediction
                  <br />
                  Journal
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Explanatory text */}
          <div className="w-full md:w-1/2 space-y-6 max-w-[440px]">
            <h2 className="font-sans text-2xl md:text-3xl font-normal">
              Build a Research Agent
            </h2>
            <p className="text-muted-foreground text-lg">
              Customize our TypeScript codebase to create a bot that can
              research, analyze data, and make predictions on Sapience markets
              autonomously.
            </p>

            <div className="pt-2">
              <Link
                href="https://github.com/foilxyz/foil/tree/main/packages/agent"
                target="_blank"
                rel="noopener noreferrer"
                passHref
              >
                <Button>
                  <Github className="mr-1 h-4 w-4" /> Clone the codebase
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Main page component
export default function BotsPage() {
  return (
    <main className="min-h-screen w-full">
      <BotsHero />
      <MCPSection />
      <TemplateSection />
    </main>
  );
}
