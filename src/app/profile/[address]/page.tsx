import type { Metadata } from 'next';
import ProfilePageContent from '~/components/profile/pages/ProfilePageContent';

type Props = {
  params: Promise<{ address: string }>;
};

// The dynamic `/og/profile` renderer was a route handler, which `output:
// 'export'` cannot emit — it was removed with the rest of the server routes.
// Point at the static card instead so share previews resolve rather than 404.
const OG_IMAGE = 'https://sapience.xyz/og-image.png';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;

  return {
    title: `Profile ${address}`,
    description: `View forecasting activity and performance for ${address}`,
    openGraph: {
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `Profile ${address}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: [OG_IMAGE],
    },
  };
}

export default function ProfilePage() {
  return <ProfilePageContent />;
}
