'use client';

import BotSection from '~/components/home/BotSection';
import TopicsOfInterest from '~/components/home/FocusAreas';
import FutarchySection from '~/components/home/FutarchySection';
import Hero from '~/components/home/Hero';

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
