import type { Metadata } from 'next';
import SharePage, {
  generateMetadata as shareGenerateMetadata,
} from '~/app/share/page';

type PageProps = {
  params: Promise<{ t: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  return shareGenerateMetadata({
    searchParams: Promise.resolve({ t: params.t }),
  });
}

export default async function ShortSharePage(props: PageProps) {
  const params = await props.params;
  return <SharePage searchParams={Promise.resolve({ t: params.t })} />;
}
