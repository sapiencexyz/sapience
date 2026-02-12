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
    openGraph: {
      images: [
        {
          url: `/og/profile?address=${address}`,
          width: 1200,
          height: 630,
          alt: `Profile ${address}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og/profile?address=${address}`],
    },
  };
}

export default function ProfilePage() {
  return <ProfilePageContent />;
}
