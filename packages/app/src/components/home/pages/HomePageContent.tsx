'use client';

import Hero from '~/components/home/Hero';
import HowItWorks from '~/components/home/pages/HowItWorks';
import Ecosystem from '~/components/home/pages/Ecosystem';
import Features from '~/components/home/pages/Features';

const HomePageContent = () => {
  return (
    <div className="relative flex flex-col min-h-screen w-full overflow-x-hidden">
      <Hero />
      <HowItWorks />
      <Ecosystem />
      <Features />
    </div>
  );
};

export default HomePageContent;
