'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Megaphone,
  Search,
  TrendingUp,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

// Template section renamed to Research Bot Boilerplate
export default function TemplateSection() {
  return (
    <section id="templates" className="py-16 md:py-24 px-4 sm:px-6 w-full">
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
