import type { Metadata } from 'next';
import SharePage, {
  generateMetadata as shareGenerateMetadata,
} from '~/app/share/page';

export function generateMetadata({
  params,
}: {
  params: { t: string };
}): Metadata {
  return shareGenerateMetadata({ searchParams: { t: params.t } });
}

export default function ShortSharePage({ params }: { params: { t: string } }) {
  return <SharePage searchParams={{ t: params.t }} />;
}
