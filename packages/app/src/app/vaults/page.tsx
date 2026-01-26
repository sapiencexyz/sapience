import type { Metadata } from 'next';
import VaultsPageContent from '~/components/vaults/pages/VaultsPageContent';

export const metadata: Metadata = {
  title: 'Prediction Market Vaults',
  description: 'Deposit into automated prediction market strategies',
};

const VaultsPage = () => {
  return <VaultsPageContent />;
};

export default VaultsPage;
