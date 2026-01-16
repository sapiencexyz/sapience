import { brotliDecompressSync, inflateRawSync } from 'zlib';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@sapience/ui/components/ui/button';

type SharePageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

type TokenData = {
  img?: string;
  title?: string;
  description?: string;
  alt?: string;
  url?: string;
  // Short form variants
  i?: string;
  t?: string;
  d?: string;
  a?: string;
  u?: string;
};

function coerceString(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim()) return val;
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string')
    return val[0];
  return undefined;
}

function toAbsoluteUrl(urlOrPath: string, base?: URL): string {
  try {
    const u = new URL(urlOrPath);
    return u.toString();
  } catch {
    if (base) return new URL(urlOrPath, base).toString();
    return urlOrPath;
  }
}

function decodeToken(token: string): TokenData | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const buf = Buffer.from(b64 + pad, 'base64');

    let jsonStr: string | null = null;
    try {
      jsonStr = brotliDecompressSync(Uint8Array.from(buf)).toString('utf8');
    } catch {
      // Fall through to try deflate
    }

    if (!jsonStr) {
      try {
        jsonStr = inflateRawSync(Uint8Array.from(buf)).toString('utf8');
      } catch {
        return null;
      }
    }

    return jsonStr ? (JSON.parse(jsonStr) as TokenData) : null;
  } catch {
    return null;
  }
}

function extractParamFromImg(
  img: string | undefined,
  paramName: string
): string | undefined {
  if (!img) return undefined;
  try {
    const u = new URL(img, 'http://local');
    const raw = u.searchParams.get(paramName) || '';
    const cleaned = raw.replace(/\s/g, '').toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(cleaned)) return cleaned;
  } catch (err) {
    console.error(
      `extractParamFromImg: failed to parse ${paramName}`,
      img,
      err
    );
  }
  return undefined;
}

function buildPositionImageUrl(nftId: string, marketAddress: string): string {
  const qp = new URLSearchParams();
  qp.set('nftId', nftId);
  qp.set('marketAddress', marketAddress);
  return `/og/position?${qp.toString()}`;
}

export function generateMetadata({ searchParams }: SharePageProps): Metadata {
  const token = coerceString(searchParams?.t);
  const nftId = coerceString(searchParams?.nftId);
  const marketAddress = coerceString(searchParams?.marketAddress);
  let img = coerceString(searchParams?.img);
  const title = 'Prediction Markets';
  let description =
    coerceString(searchParams?.description) || 'Sapience Prediction Markets';
  let imageAlt = coerceString(searchParams?.alt) || 'Sapience Share Image';
  let canonical = coerceString(searchParams?.url);

  if (nftId && marketAddress) {
    img = buildPositionImageUrl(nftId, marketAddress);
  }

  if (token) {
    const data = decodeToken(token);
    if (data) {
      img = data.img ?? data.i ?? img;
      description = data.description ?? data.d ?? description;
      imageAlt = data.alt ?? data.a ?? imageAlt;
      canonical = data.url ?? data.u ?? canonical;
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
  const nftId = coerceString(searchParams?.nftId);
  const marketAddress = coerceString(searchParams?.marketAddress);
  let img = coerceString(searchParams?.img);
  let alt = coerceString(searchParams?.alt) || 'Share image';
  const addrFromQuery = extractParamFromImg(img, 'addr');
  const groupFromQuery = extractParamFromImg(img, 'group');

  if (nftId && marketAddress) {
    img = buildPositionImageUrl(nftId, marketAddress);
  }

  if (token) {
    const data = decodeToken(token);
    if (data) {
      img = data.img ?? data.i ?? img;
      alt = data.alt ?? data.a ?? alt;
    }
  }

  const addr = extractParamFromImg(img, 'addr') || addrFromQuery;
  const group = extractParamFromImg(img, 'group') || groupFromQuery;

  // Simple, crawlable HTML body for social scrapers and a basic human fallback
  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-3xl">
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
