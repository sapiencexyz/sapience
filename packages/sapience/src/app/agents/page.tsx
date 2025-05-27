'use client';

import dynamic from 'next/dynamic';

const AgentsHero = dynamic(() => import('~/components/agents/AgentsHero'), {
  ssr: false,
});

const ClaudeSection = dynamic(
  () => import('~/components/agents/ClaudeSection'),
  {
    ssr: false,
  }
);

const CursorSection = dynamic(
  () => import('~/components/agents/CursorSection'),
  {
    ssr: false,
  }
);

// Main page component
export default function AgentsPage() {
  return (
    <main className="min-h-screen w-full">
      <AgentsHero />
      <ClaudeSection />
      <CursorSection />
    </main>
  );
}
