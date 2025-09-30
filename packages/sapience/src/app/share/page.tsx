import { brotliDecompressSync, inflateRawSync } from 'zlib';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@sapience/ui/components/ui/button';
import SplineTopBackground from '~/components/shared/SplineTopBackground';

type SharePageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function coerceString(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim()) return val;
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string')
    return val[0];
  return undefined;
}

function toAbsoluteUrl(urlOrPath: string, base?: URL): string {
  try {
    // If already absolute, return as-is
    const u = new URL(urlOrPath);
    return u.toString();
  } catch {
    if (base) return new URL(urlOrPath, base).toString();
    return urlOrPath;
  }
}

function extractAddrFromImg(img?: string): string | undefined {
  if (!img) return undefined;
  try {
    // Support relative paths by providing a dummy base
    const u = new URL(img, 'http://local');
    const raw = (u.searchParams.get('addr') || '').toString();
    const cleaned = raw.replace(/\s/g, '').toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(cleaned)) return cleaned;
  } catch (err) {
    console.error('extractAddrFromImg: failed to parse img', img, err);
  }
  return undefined;
}

function extractGroupFromImg(img?: string): string | undefined {
  if (!img) return undefined;
  try {
    const u = new URL(img, 'http://local');
    const raw = (u.searchParams.get('group') || '').toString();
    const cleaned = raw.replace(/\s/g, '').toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(cleaned)) return cleaned;
  } catch (err) {
    console.error('extractGroupFromImg: failed to parse img', img, err);
  }
  return undefined;
}

export function generateMetadata({ searchParams }: SharePageProps): Metadata {
  const token = coerceString(searchParams?.t);
  let img = coerceString(searchParams?.img);
  const title = 'Prediction Markets';
  let description =
    coerceString(searchParams?.description) || 'Sapience Prediction Markets';
  let imageAlt = coerceString(searchParams?.alt) || 'Sapience Share Image';
  let canonical = coerceString(searchParams?.url);

  // If short token is present, decode fields from token
  if (token) {
    try {
      const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const buf = Buffer.from(b64 + pad, 'base64');
      let jsonStr: string | null = null;
      try {
        jsonStr = brotliDecompressSync(Uint8Array.from(buf)).toString('utf8');
      } catch {
        jsonStr = null;
      }
      if (!jsonStr) {
        try {
          jsonStr = inflateRawSync(Uint8Array.from(buf)).toString('utf8');
        } catch {
          jsonStr = null;
        }
      }
      if (jsonStr) {
        const data = JSON.parse(jsonStr) as Partial<
          | {
              img: string;
              title?: string;
              description?: string;
              alt?: string;
              url?: string;
            }
          | { i: string; t?: string; d?: string; a?: string; u?: string }
        >;
        const resolvedImg = (data as any).img ?? (data as any).i;
        const resolvedDesc = (data as any).description ?? (data as any).d;
        const resolvedAlt = (data as any).alt ?? (data as any).a;
        const resolvedUrl = (data as any).url ?? (data as any).u;
        img = (resolvedImg as string) || img;
        description = (resolvedDesc as string) || description;
        imageAlt = (resolvedAlt as string) || imageAlt;
        canonical = (resolvedUrl as string) || canonical;
      }
    } catch {
      // ignore token decode errors; fall back to query params
    }
  }

  // Next will resolve relative URLs using metadataBase from the root layout
  const absoluteImg = img
    ? toAbsoluteUrl(img, (global as any).__NEXT_METADATA_BASE)
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: absoluteImg
        ? [
            {
              url: absoluteImg,
              width: 1200,
              height: 630,
              alt: imageAlt,
            },
          ]
        : undefined,
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: absoluteImg ? [absoluteImg] : undefined,
    },
    alternates: canonical ? { canonical } : undefined,
    robots: { index: true, follow: true },
  };
}

export default function SharePage({ searchParams }: SharePageProps) {
  const token = coerceString(searchParams?.t);
  let img = coerceString(searchParams?.img);
  let alt = coerceString(searchParams?.alt) || 'Share image';
  const addrFromQuery = extractAddrFromImg(img);
  const groupFromQuery = extractGroupFromImg(img);

  if (token) {
    try {
      const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const buf = Buffer.from(b64 + pad, 'base64');
      let jsonStr: string | null = null;
      try {
        jsonStr = brotliDecompressSync(Uint8Array.from(buf)).toString('utf8');
      } catch {
        jsonStr = null;
      }
      if (!jsonStr) {
        try {
          jsonStr = inflateRawSync(Uint8Array.from(buf)).toString('utf8');
        } catch {
          jsonStr = null;
        }
      }
      if (jsonStr) {
        const data = JSON.parse(jsonStr) as Partial<
          { img: string; alt?: string } | { i: string; a?: string }
        >;
        const resolvedImg = (data as any).img ?? (data as any).i;
        const resolvedAlt = (data as any).alt ?? (data as any).a;
        img = (resolvedImg as string) || img;
        alt = (resolvedAlt as string) || alt;
      }
    } catch {
      // ignore
    }
  }
  const addr = extractAddrFromImg(img) || addrFromQuery;
  const group = extractGroupFromImg(img) || groupFromQuery;

  // Simple, crawlable HTML body for social scrapers and a basic human fallback
  return (
    <div className="relative min-h-screen">
      <SplineTopBackground />
      <main className="relative container mx-auto px-4 mt-36 mb-12 max-w-3xl">
        <div className="flex flex-col items-center text-center">
          {img ? (
            // Intentionally not using next/image here to avoid loader constraints for absolute URLs
            <img
              src={img}
              alt={alt}
              className="max-w-full h-auto rounded-sm border"
            />
          ) : null}
          <div className="mt-10 flex flex-col items-stretch gap-4 md:flex-col lg:flex-row lg:items-center lg:gap-6">
            {addr ? (
              <Button asChild size="lg" className="w-full lg:w-auto px-6">
                <Link href={`/profile/${addr}`}>Show Full Profile</Link>
              </Button>
            ) : null}
            {group ? (
              <Button asChild size="lg" className="w-full lg:w-auto px-6">
                <Link href={`/markets/arb1:${group}`}>
                  View Prediction Market
                </Link>
              </Button>
            ) : null}
            <Button asChild size="lg" className="w-full lg:w-auto px-6">
              <Link href="/markets">Explore More Questions</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
