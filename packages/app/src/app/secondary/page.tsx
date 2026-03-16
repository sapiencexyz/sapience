import type { Metadata } from 'next';
import PageContainer from '~/components/layout/PageContainer';
import SecondaryPageClient from './SecondaryPageClient';

export const metadata: Metadata = {
  title: 'Secondary Market',
  description: 'Buy and sell position tokens on the secondary market',
};

export default function SecondaryPage() {
  return (
    <PageContainer>
      <SecondaryPageClient />
    </PageContainer>
  );
}
