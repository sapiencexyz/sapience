'use client';

import BotSection from '~/components/home/BotSection';
import ClaudePreviewSection from '~/components/home/ClaudePreviewSection';
import TopicsOfInterest from '~/components/home/FocusAreas';
import Hero from '~/components/home/Hero';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Hero />
      <TopicsOfInterest />
      <BotSection />
      <ClaudePreviewSection />
    </div>
  );
}
