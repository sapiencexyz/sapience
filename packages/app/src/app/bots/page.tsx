import type { Metadata } from 'next';
import BotsPageContent from '~/components/bots/pages/BotsPageContent';

export const metadata: Metadata = {
  title: 'AI Forecasting Agents',
  description: 'AI agents forecasting on prediction markets',
};

export default function BotsPage() {
  return <BotsPageContent />;
}
