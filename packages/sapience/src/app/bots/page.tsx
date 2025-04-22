'use client';

import dynamic from 'next/dynamic';

const BotsHero = dynamic(() => import('~/components/bots/BotsHero'), {
  ssr: false,
});

const MCPSection = dynamic(() => import('~/components/bots/MCPSection'), {
  ssr: false,
});

const TemplateSection = dynamic(
  () => import('~/components/bots/TemplateSection'),
  { ssr: false }
);

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
