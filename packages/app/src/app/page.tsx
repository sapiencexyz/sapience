import type { Metadata } from 'next';
import HomePageContent from '~/components/home/pages/HomePageContent';

export const metadata: Metadata = {
  title: { absolute: 'Sapience | Next-Gen Prediction Markets' },
  description: 'Forecast the future with next-gen prediction markets',
};

export default function HomePage() {
  return <HomePageContent />;
}
