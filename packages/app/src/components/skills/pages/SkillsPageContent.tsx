'use client';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { Button } from '@sapience/ui/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';

const SKILL_RAW_URL = '/SKILL.md';
const SKILL_REPO_URL =
  'https://github.com/sapiencexyz/sapience/blob/main/packages/app/public/SKILL.md';

const SkillsPageContent = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSkill = async () => {
      try {
        const res = await fetch(SKILL_RAW_URL);
        if (res.ok) {
          const text = await res.text();
          setSkillContent(text);
        }
      } catch {
        // Silently fail, will show placeholder
      } finally {
        setIsLoading(false);
      }
    };
    fetchSkill();
  }, []);

  const handleCopy = async () => {
    if (!skillContent) return;
    await navigator.clipboard.writeText(skillContent);
    setCopied(true);
    toast({
      title: 'Copied to clipboard',
      description: 'SKILL.md content copied successfully',
      duration: 2000,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen w-full">
      {/* Hero Section */}
      <section className="relative isolate w-full pt-16 md:pt-20 lg:pt-24 pb-12 md:pb-16 overflow-hidden border-b border-brand-white/10">
        <HeroBackgroundLines />
        <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl px-4 md:px-8">
          <div className="flex flex-col items-start">
            <h1 className="font-sans text-3xl md:text-4xl lg:text-5xl text-foreground mb-6">
              Sapience Skill for Agents
            </h1>
            <p className="font-mono text-sm md:text-base uppercase tracking-wider text-brand-white mb-8">
              Compatible with Claude, Codex, OpenClaw, and more
            </p>
            <p className="text-lg md:text-xl text-foreground max-w-4xl mb-8">
              Give your agent skills to autonomously trade prediction markets.
              Leverage fully open source and onchain infrastructure, granting
              your agent full transparency into how the markets operate.
            </p>
            <Button variant="outline" asChild>
              <a
                href={SKILL_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative isolate w-full py-12 md:py-16 overflow-hidden">
        <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl px-4 md:px-8">
          <div className="grid md:grid-cols-5 gap-6 md:gap-8 mb-12 md:mb-16">
            {/* Two Modes Card */}
            <div className="md:col-span-3 bg-brand-black rounded-2xl border border-brand-white/10 p-6 md:p-8 flex flex-col">
              <h3 className="eyebrow text-foreground mb-6">Two Modes</h3>
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <span className="font-mono text-sm uppercase tracking-wider text-brand-white">
                    Prediction Market Trader
                  </span>
                  <p className="text-muted-foreground mt-2">
                    Build positions, run auctions for quotes, receive bids from
                    market makers, and submit them onchain.
                  </p>
                </div>
                <div className="w-px self-stretch bg-brand-white/20" />
                <div className="flex-1">
                  <span className="font-mono text-sm uppercase tracking-wider text-brand-white">
                    Prediction Market Maker
                  </span>
                  <p className="text-muted-foreground mt-2">
                    Listen for traders taking positions and be the counterparty
                    by offering odds on future outcomes.
                  </p>
                </div>
              </div>
            </div>

            {/* What You Get Card */}
            <div className="md:col-span-2 bg-brand-black rounded-2xl border border-brand-white/10 p-6 md:p-8">
              <h3 className="eyebrow text-foreground mb-4">What You Get</h3>
              <ul className="space-y-2 text-muted-foreground list-disc list-inside">
                <li>WebSocket protocol for RFQs</li>
                <li>GraphQL endpoint for market data</li>
                <li>Listener scripts for auctions</li>
                <li>Reference for signing bids</li>
              </ul>
            </div>
          </div>

          <p className="headline border-l-2 border-accent-gold pl-6 mb-12 md:mb-16">
            No strategy included. You bring the edge, the skill handles
            execution.
          </p>

          {/* Installation */}
          <div className="mb-8">
            <h2 className="eyebrow text-foreground mb-4">Installation</h2>
            <p className="text-lg text-muted-foreground">
              Tell your agent to install the skill at{' '}
              <a
                href="https://sapience.xyz/SKILL.md"
                target="_blank"
                rel="noopener noreferrer"
                className="gold-link font-mono"
              >
                https://sapience.xyz/SKILL.md
              </a>
            </p>
          </div>

          {/* Code Snippet Box */}
          <div className="rounded-2xl border border-brand-white/10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-brand-white/5 border-b border-brand-white/10">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-foreground">
                  SKILL.md
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!skillContent}
                className="h-8 px-3 text-xs gap-2 hover:bg-brand-white/10"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {/* Code Content */}
            <div className="bg-brand-black p-4 md:p-6 overflow-x-auto max-h-[500px] overflow-y-auto">
              {isLoading ? (
                <div className="text-muted-foreground text-sm font-mono">
                  Loading...
                </div>
              ) : skillContent ? (
                <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {skillContent}
                </pre>
              ) : (
                <div className="text-muted-foreground text-sm font-mono">
                  Failed to load SKILL.md. View it directly on{' '}
                  <a
                    href={SKILL_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gold-link"
                  >
                    GitHub
                  </a>
                  .
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SkillsPageContent;
