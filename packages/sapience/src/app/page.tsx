'use client';

import TopicsOfInterest from '~/components/FocusAreas';
import Hero from '~/components/Hero';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Hero />
      <TopicsOfInterest />
    </div>
  );
}
