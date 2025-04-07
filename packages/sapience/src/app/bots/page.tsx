'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  ArrowRight,
  Bot,
  Code,
  ExternalLink,
  Github,
  Search,
} from 'lucide-react';
import Link from 'next/link';

// Hero section for the bots page - smaller than homepage hero but still exciting
const BotsHero = () => {
  return (
    <div className="relative overflow-hidden flex items-center justify-center w-full">
      {/* Outer container with padding and iframe background */}
      <div className="relative z-10 w-full max-w-4xl px-4 sm:px-6 pt-24 pb-12">
        <div className="relative overflow-hidden rounded-xl shadow-sm shadow-inner p-14 border border-gray-500/20">
          {/* Iframe as background within the outer box */}
          <div
            className="absolute inset-0 z-0 overflow-hidden rounded-xl"
            style={{ opacity: 0.4, transformOrigin: 'center center' }}
          >
            <iframe
              title="art"
              src="https://my.spline.design/particlescopy-3815e097877aa631d0301821f63f852c/"
              width="100%"
              height="100%"
              className="rounded-xl"
            />
          </div>

          {/* Inner Content card overlaid on top */}
          <div className="relative z-10 w-full text-center px-6 py-10 bg-background/[0.25] backdrop-blur-[3px] border border-gray-500/20 rounded-xl shadow-sm">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              Build AI-Powered Bots
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Create software leveraging large language models that can conduct
              research and trade prediction markets with superhuman ability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// MCP Section with more details
const MCPSection = () => {
  return (
    <section className="py-16 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left column with text content */}
          <div className="w-full md:w-1/2 space-y-6">
            <h2 className="font-sans text-2xl md:text-3xl font-normal">
              Use Sapience with Claude
            </h2>

            <p className="text-lg text-muted-foreground">
              Give an AI assistant tools to interact with predictions markets
              using Sapience&apos;s Model Context Protocol server. Connect to
              any{' '}
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
              <div className="flex items-stretch max-w-md">
                <div className="bg-black text-white px-4 font-mono text-sm flex items-center rounded-l-md flex-grow">
                  <span>npx @foil/agent install</span>
                </div>
                <Button
                  variant="outline"
                  size="default"
                  className="rounded-l-none border-l-0 px-3"
                  onClick={() => {
                    navigator.clipboard.writeText('npx @foil/agent install');
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

          {/* Right column for image/video */}
          <div className="w-full md:w-1/2 bg-gray-100 rounded-lg flex items-center justify-center">
            {/* Placeholder for Claude image or video */}
            <div className="text-center p-8">
              <Bot className="h-16 w-16 mx-auto text-primary/60 mb-2" />
              <p className="text-muted-foreground">
                Claude Desktop Integration Video
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Template section renamed to Research Bot Boilerplate
const TemplateSection = () => {
  return (
    <section id="templates" className="py-16 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <h2 className="font-sans text-2xl md:text-3xl font-normal mb-12 text-center">
          Sapience Research Agent Boilerplate
        </h2>

        <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left side: Flow chart with loop */}
          <div className="w-full md:w-1/2 p-6 bg-muted/30 rounded-lg">
            <div className="relative h-[400px] w-full">
              {/* Large circular connecting line */}
              <div className="absolute w-[280px] h-[280px] border-2 border-gray-200 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

              {/* Step 1: Research and Forecast - Top */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3 border border-gray-200 shadow-sm mx-auto">
                  <Search className="h-8 w-8 text-black" />
                </div>
                <p className="text-sm font-medium">Research and Forecast</p>
              </div>

              {/* Step 2: Create/Modify Market Positions - Bottom Right */}
              <div className="absolute bottom-[40px] right-[40px] text-center">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3 border border-gray-200 shadow-sm mx-auto">
                  <ArrowRight className="h-8 w-8 text-black" />
                </div>
                <p className="text-sm font-medium">
                  Create/Modify
                  <br />
                  Market Positions
                </p>
              </div>

              {/* Step 3: Update Prediction Journal - Bottom Left */}
              <div className="absolute bottom-[40px] left-[40px] text-center">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3 border border-gray-200 shadow-sm mx-auto">
                  <Bot className="h-8 w-8 text-black" />
                </div>
                <p className="text-sm font-medium">
                  Update Prediction
                  <br />
                  Journal
                </p>
              </div>

              {/* Arrow 1: Research → Create/Modify (Top Right) */}
              <div className="absolute top-[130px] right-[100px] transform rotate-[45deg]">
                <ArrowRight className="h-5 w-5 text-black" />
              </div>

              {/* Arrow 2: Create/Modify → Update (Bottom) */}
              <div className="absolute bottom-[60px] left-1/2 -translate-x-1/2">
                <ArrowRight className="h-5 w-5 text-black" />
              </div>

              {/* Arrow 3: Update → Research (Top Left) */}
              <div className="absolute top-[130px] left-[100px] transform rotate-[-45deg]">
                <ArrowRight className="h-5 w-5 text-black" />
              </div>
            </div>
          </div>

          {/* Right side: Explanatory text */}
          <div className="w-full md:w-1/2 space-y-6">
            <h3 className="text-xl font-medium">
              Build Your Own Prediction Bot
            </h3>
            <p className="text-muted-foreground">
              Use our boilerplate to create an AI-powered bot that can research,
              analyze data, and make intelligent predictions on Foil markets
              autonomously.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Code className="h-5 w-5 text-primary mt-1" />
                <div>
                  <h4 className="font-medium">Open Source Template</h4>
                  <p className="text-muted-foreground">
                    Clone our TypeScript templates to get started with a fully
                    functional research agent that can execute trades on your
                    behalf.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ExternalLink className="h-5 w-5 text-primary mt-1" />
                <div>
                  <h4 className="font-medium">Learn From the Community</h4>
                  <p className="text-muted-foreground">
                    Explore prediction journals from existing bots on Twitter to
                    see real-world examples of AI-powered market analysis and
                    decision making.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button className="mr-4">
                <Github className="mr-2 h-4 w-4" /> Get Boilerplate
              </Button>
              <Button variant="outline">
                View Bot Journals <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
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
