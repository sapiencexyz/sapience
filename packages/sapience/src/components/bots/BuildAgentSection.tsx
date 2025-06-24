'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Megaphone,
  Search,
  TrendingUp,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

export default function BuildAgentSection() {
  return (
    <section id="templates" className="py-16 lg:py-24 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-8 lg:items-center">
          {/* Left side: Flow chart with loop */}
          <div className="w-full lg:w-1/2 p-6">
            {/* Adjusted height for mobile */}
            <div className="relative h-[300px] lg:h-[400px] w-full">
              {/* Responsive large circular connecting line */}
              <div className="absolute w-[200px] h-[200px] lg:w-[280px] lg:h-[280px] border-2 border-muted rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

              {/* Centered Spinning Icon - size adjusted */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <RefreshCw
                  className="h-8 w-8 lg:h-10 lg:w-10 animate-spin opacity-20"
                  strokeWidth={1}
                  style={{ animationDuration: '8s' }}
                />
              </div>

              {/* Step 1: Research and Forecast - Top - Responsive positioning and size */}
              <div className="absolute top-4 lg:top-8 left-1/2 -translate-x-1/2 text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center mb-2 lg:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <Search className="h-6 w-6 lg:h-8 lg:w-8 text-black" />
                </div>
                <p className="text-xs lg:text-sm font-medium">
                  Research and Forecast
                </p>
              </div>

              {/* Step 2: Create/Modify Market Positions - Bottom Right - Responsive positioning and size */}
              <div className="absolute bottom-[20px] right-[40px] lg:bottom-[40px] lg:right-[80px] text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center mb-2 lg:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <TrendingUp className="h-6 w-6 lg:h-8 lg:w-8 text-black" />
                </div>
                <p className="text-xs lg:text-sm font-medium">
                  Update
                  <br />
                  Market Positions
                </p>
              </div>

              {/* Step 3: Update Prediction Journal - Bottom Left - Responsive positioning and size */}
              <div className="absolute bottom-[20px] left-[40px] lg:bottom-[40px] lg:left-[80px] text-center">
                {/* Responsive icon container */}
                <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center mb-2 lg:mb-3 border border-gray-200 shadow-sm mx-auto">
                  {/* Responsive icon */}
                  <Megaphone className="h-6 w-6 lg:h-8 lg:w-8 text-black" />
                </div>
                <p className="text-xs lg:text-sm font-medium">
                  Share Prediction
                  <br />
                  Journal
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Explanatory text */}
          <div className="w-full lg:w-1/2 lg:max-w-[420px] text-left lg:text-inherit">
            <h2 className="font-sans text-2xl lg:text-3xl font-normal mb-2 lg:mb-6">
              Build a Research Agent
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              Use LLMs with the Sapience API to create a bot that can research,
              analyze data, and make predictions on Sapience markets
              autonomously.
            </p>

            <div className="pt-2">
              <Link
                href="https://docs.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
                passHref
              >
                <Button>
                  <BookOpen className="h-4 w-4 mr-1" />
                  Read the Docs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
