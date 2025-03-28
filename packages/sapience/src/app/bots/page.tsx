'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ArrowRight, Bot, Brain, Code, ExternalLink, Github, Search, Shield } from 'lucide-react';

// Bot icon component with gray circle background
const BotIcon = ({ icon: Icon, language = 'ts' }: { icon: React.ElementType, language?: 'py' | 'ts' }) => (
  <div 
    className="rounded-full p-3 w-12 h-12 flex items-center justify-center bg-gray-100 relative"
  >
    <Icon className="h-5 w-5 text-primary" />
    
    {/* Language indicator */}
    <div className="absolute -bottom-1 -right-1 rounded-full w-5 h-5 flex items-center justify-center bg-white border border-gray-200 shadow-sm">
      {language === 'py' ? (
        <div className="text-[10px] font-bold text-blue-600">Py</div>
      ) : (
        <div className="text-[10px] font-bold text-blue-500">Ts</div>
      )}
    </div>
  </div>
);

// Hero section for the bots page - smaller than homepage hero but still exciting
const BotsHero = () => {
  return (
    <div className="relative min-h-[50vh] overflow-hidden flex items-center justify-center w-full border-b border-gray-500/20">
      {/* Spline embed background - made larger than viewport */}
      <div className="absolute inset-0 z-0" style={{ opacity: 0.4, transformOrigin: 'center center' }}>
      <iframe src='https://my.spline.design/particlescopy-3815e097877aa631d0301821f63f852c/' width='100%' height='100%'></iframe>
      </div>

      {/* Content card */}
      <div className="z-10 w-full max-w-4xl px-4 sm:px-6">
        <div className="w-full text-center px-6 sm:px-8 py-10 sm:py-12 bg-background/[0.25] backdrop-blur-[3px] border border-gray-500/20 rounded-xl shadow-sm">
          <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
            Build AI-Powered Bots
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Create software leveraging large language models that can 
            conduct research and trade prediction markets with superhuman ability
          </p>
        </div>
      </div>
    </div>
  );
};

// MCP Section with more details
const MCPSection = () => {
  return (
    <section className="py-16 px-4 sm:px-6 bg-muted/30 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <h2 className="font-sans text-2xl md:text-3xl font-normal mb-12 text-center">Model Context Protocol Server</h2>
        
        <div className="grid md:grid-cols-3 gap-8 mb-10 w-full">
          <Card className="border border-gray-500/20">
            <CardHeader>
              <div className="flex items-center mb-2">
                <BotIcon icon={Shield} language="ts" />
                <CardTitle className="text-xl font-semibold ml-3">Claude Desktop Integration</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Seamlessly connect Claude Desktop with Foil's prediction markets through MCP, enabling your AI assistant
                to analyze market conditions and execute trades directly from your desktop.
              </p>
            </CardContent>
          </Card>
          
          <Card className="border border-gray-500/20">
            <CardHeader>
              <div className="flex items-center mb-2">
                <BotIcon icon={Code} language="ts" />
                <CardTitle className="text-xl font-semibold ml-3">Secure Trading Interface</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                MCP provides a secure JSON-RPC interface that allows Claude Desktop to interact with Foil's markets
                while maintaining proper authentication and user consent for all trading actions.
              </p>
            </CardContent>
          </Card>
          
          <Card className="border border-gray-500/20">
            <CardHeader>
              <div className="flex items-center mb-2">
                <BotIcon icon={Brain} language="ts" />
                <CardTitle className="text-xl font-semibold ml-3">Advanced Reasoning</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Leverage Claude's advanced reasoning capabilities with MCP's sampling feature to break down complex
                market analysis into clear, actionable trading decisions.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <div className="text-center w-full">
          <Button asChild size="lg">
            <Link href="https://modelcontextprotocol.io/introduction" target="_blank" rel="noopener noreferrer">
              Learn More About MCP <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
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
        <h2 className="font-sans text-2xl md:text-3xl font-normal mb-12 text-center">Sapience Research Agent</h2>
        
        <div className="w-full">
          <Card className="border border-gray-500/20 shadow-lg hover:shadow-xl transition-all duration-300 w-full">
            <CardHeader className="pb-2">
              <div className="flex items-center mb-2">
                <BotIcon icon={Bot} language="ts" />
                <CardTitle className="text-xl font-semibold ml-3">TypeScript Research Agent</CardTitle>
              </div>
              <CardDescription>
                Advanced research agent using multiple search methods and local LLMs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                
                {/* Workflow visualization with stacked first column */}
                <div className="my-6 px-4">
                  {/* Container with relative positioning */}
                  <div className="relative h-36">
                    {/* Connecting line - positioned absolutely */}
                    <div className="absolute top-14 left-0 right-0 h-0.5 bg-gray-200"></div>
                    
                    {/* Step 1: Search - Stacked circles */}
                    <div className="absolute left-0 w-1/4 flex flex-col items-center">
                      {/* Brave Search */}
                      <div className="flex flex-col items-center mb-1">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-1 border border-primary/20 shadow-sm">
                          <Search className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-xs text-center">Brave Search</p>
                      </div>
                      
                      {/* DuckDuckGo */}
                      <div className="flex flex-col items-center mb-1">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-1 border border-primary/20 shadow-sm">
                          <Search className="h-4 w-4 text-orange-500" />
                        </div>
                        <p className="text-xs text-center">DuckDuckGo</p>
                      </div>
                      
                      {/* Web Browser */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-1 border border-primary/20 shadow-sm">
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                        </div>
                        <p className="text-xs text-center">Web Browser</p>
                      </div>
                    </div>
                    
                    {/* Step 2: Analyze */}
                    <div className="absolute left-1/4 w-1/4 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-2 border border-primary/20 shadow-sm">
                        <Brain className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs text-center">Analyze data and determine certainty</p>
                    </div>
                    
                    {/* Step 3: Execute */}
                    <div className="absolute left-2/4 w-1/4 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-2 border border-primary/20 shadow-sm">
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs text-center">Execute trades based on confidence</p>
                    </div>
                    
                    {/* Step 4: Leverage */}
                    <div className="absolute left-3/4 w-1/4 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-2 border border-primary/20 shadow-sm">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs text-center">Run entirely locally with no API costs</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted p-4 rounded-md mt-4 overflow-x-auto">
                  <pre className="text-xs md:text-sm">
                    <code>
{`// Example code snippet
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { BraveSearchAPIWrapper, DuckDuckGoSearchAPI, WebBrowser } from "langchain/tools";
import { Ollama } from "langchain/llms/ollama";

// Initialize the LLM
const llm = new Ollama({
  model: "llama3",
  baseUrl: "http://localhost:11434"
});

// Create search tools
const braveSearch = new BraveSearchAPIWrapper();
const duckDuckGoSearch = new DuckDuckGoSearchAPI();
const webBrowser = new WebBrowser();

// Initialize the agent
const agent = await createReactAgent({
  llm,
  tools: [braveSearch, duckDuckGoSearch, webBrowser]
});

const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools: [braveSearch, duckDuckGoSearch, webBrowser],
  verbose: true
});

// Research and trade
const result = await executor.invoke({
  input: "Research the latest developments in AI regulation and determine if I should trade on the 'AI Regulation' market."
});`}
                    </code>
                  </pre>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-4 flex justify-between">
              <Button variant="outline">
                <Github className="mr-2 h-4 w-4" /> View on GitHub
              </Button>
              <Button>
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
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