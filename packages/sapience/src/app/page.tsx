'use client';

import BotSection from '~/components/BotSection';
import TopicsOfInterest from '~/components/FocusAreas';
import FutarchySection from '~/components/FutarchySection';
import Hero from '~/components/Hero';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Hero />
      <TopicsOfInterest />
      <BotSection />
      <FutarchySection />
    </div>
  );
}
