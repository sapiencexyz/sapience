'use client';

import { Button } from '@foil/ui/components/ui/button';
import { ArrowRight, Bot } from 'lucide-react';
import Link from 'next/link';

export default function BotSection() {
  return (
    <section className="py-16 px-4 bg-secondary/10">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row items-start gap-8">
          {/* Text content */}
          <div className="flex-1">
            <h2 className="text-3xl font-heading font-bold mb-6">
              Automated Agents & Bots
            </h2>
            <p className="text-lg mb-4">
              Sapience provides powerful infrastructure for creating and
              deploying intelligent, autonomous agents that can interact with
              prediction markets and other data sources.
            </p>

            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-2">MCP Server</h3>
              <p className="text-muted-foreground">
                The Master Control Program (MCP) server orchestrates agent
                activities, manages authentication, and coordinates data flow
                between agents and markets. It serves as the central hub for all
                automated interactions.
              </p>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-2">Agent Boilerplate</h3>
              <p className="text-muted-foreground">
                Get started quickly with our agent boilerplate templates that
                provide the foundation for creating custom prediction agents,
                data collectors, and market-making bots.
              </p>
            </div>

            <Button asChild size="lg" variant="outline" className="mt-4">
              <Link href="/bots">
                Explore Agents <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Visual content */}
          <div className="flex-1 flex items-center justify-center p-8 bg-background rounded-lg border border-border">
            <div className="relative w-full aspect-square max-w-md">
              <div className="absolute inset-0 flex items-center justify-center">
                <Bot className="w-24 h-24 text-primary/50" />
              </div>
              <div className="absolute inset-0">
                <div className="w-full h-full flex items-center justify-center">
                  <code className="text-xs text-muted-foreground overflow-hidden max-h-48 p-4 bg-muted rounded">
                    <pre>
                      {`// Agent template
import { SapienceAgent } from '@sapience/agents';

class PredictionAgent extends SapienceAgent {
  async analyze(data) {
    // Process incoming market data
    const prediction = this.model.predict(data);
    
    // Take action based on prediction
    if (prediction.confidence > 0.7) {
      await this.placePosition({
        market: data.marketId,
        direction: prediction.direction,
        size: prediction.recommendedSize
      });
    }
  }
}

// Initialize and connect to MCP
const agent = new PredictionAgent({
  name: 'AI Predictor v1',
  mcpEndpoint: process.env.MCP_SERVER_URL,
  apiKey: process.env.MCP_API_KEY
});

agent.start();`}
                    </pre>
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
