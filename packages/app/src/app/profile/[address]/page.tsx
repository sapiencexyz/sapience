import type { Metadata } from 'next';
import ProfilePageContent from '~/components/profile/pages/ProfilePageContent';

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `Profile ${truncated}`,
    description: `View forecasting activity and performance for ${truncated}`,
  };
}

export default function ProfilePage() {
  return <ProfilePageContent />;
}
