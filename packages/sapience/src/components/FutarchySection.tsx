'use client';

import { Button } from '@foil/ui/components/ui/button';
import { ArrowRight, LightbulbIcon } from 'lucide-react';
import Link from 'next/link';

export default function FutarchySection() {
  return (
    <section className="py-12 px-4">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row-reverse items-center gap-12">
          {/* Text content */}
          <div className="flex-1">
            <h2 className="text-3xl font-heading font-bold mb-6">
              Futarchy: Markets for Better Decisions
            </h2>
            <p className="text-lg mb-6">
              Inspired by futarchy, we’re building prediction markets that help
              inform better policy decisions.
            </p>
            <p className="text-muted-foreground mb-8">
              Our infrastructure lets organizations harness collective
              intelligence through markets without changing governance
              structures.
            </p>

            <Button asChild size="lg" variant="outline">
              <Link href="/futarchy">
                Learn More <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Visual content - Simplified */}
          <div className="flex-1">
            <div className="bg-secondary/10 rounded-lg p-8 relative overflow-hidden">
              <div className="grid grid-cols-1 gap-6">
                <div className="flex items-start gap-4">
                  <div className="bg-yellow-100 rounded-full p-2 mt-1">
                    <LightbulbIcon className="text-yellow-500 h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">
                      Define Questions
                    </h3>
                    <p className="text-muted-foreground">
                      Markets can predict outcomes for different policy options
                    </p>
                  </div>
                </div>

                <div className="bg-background rounded-lg p-6 shadow-sm border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Prediction Results</span>
                    <span className="text-xs text-muted-foreground">
                      Example
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                        <span>Option A</span>
                      </div>
                      <span className="font-semibold">+21%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                        <span>Option B</span>
                      </div>
                      <span className="font-semibold">-8%</span>
                    </div>
                    <div className="h-2 bg-muted w-full rounded-full mt-2">
                      <div className="h-2 bg-green-500 w-[70%] rounded-full" />
                    </div>
                  </div>
                </div>

                <p className="text-sm text-center text-muted-foreground">
                  Forecasts help guide decisions with data-driven insights
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
