import type { Metadata } from 'next';
import { Suspense } from 'react';
import VaultsPageContent from '~/components/vaults/pages/VaultsPageContent';

export const metadata: Metadata = {
  title: 'Prediction Market Vaults',
  description: 'Deposit into automated prediction market strategies',
};

const VaultsPage = () => {
  return (
    <Suspense fallback={null}>
      <VaultsPageContent />
    </Suspense>
  );
};

export default VaultsPage;
