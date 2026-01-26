import type { Metadata } from 'next';
import ProfilePageContent from '~/components/profile/pages/ProfilePageContent';

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;

  return {
    title: `Profile ${address}`,
    description: `View forecasting activity and performance for ${address}`,
  };
}

export default function ProfilePage() {
  return <ProfilePageContent />;
}
