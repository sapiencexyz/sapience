'use client';

import Hero from '~/components/Hero';
import TopicsOfInterest from '~/components/FocusAreas';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Hero />
      <TopicsOfInterest />
    </div>
  );
}
