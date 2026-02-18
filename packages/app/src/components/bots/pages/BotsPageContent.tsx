'use client';

import dynamic from 'next/dynamic';

const BotsHero = dynamic(() => import('~/components/bots/BotsHero'), {
  ssr: false,
});

const ForecastingBotSection = dynamic(
  () => import('~/components/bots/ForecastingBotSection'),
  { ssr: false }
);
const BiddingBotSection = dynamic(
  () => import('~/components/bots/BiddingBotSection'),
  { ssr: false }
);

const BotsPageContent = () => {
  return (
    <main className="min-h-screen w-full">
      <BotsHero />
      <ForecastingBotSection />
      <BiddingBotSection />
    </main>
  );
};

export default BotsPageContent;
