import {
  brotliCompressSync,
  deflateRawSync,
  constants as zlibConstants,
} from 'zlib';
import { NextResponse } from 'next/server';

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let body: any = {};
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    } else {
      body = await req.json().catch(() => ({}));
    }

    // Use short keys to reduce size: i=img, t=title, d=description, a=alt, u=url
    const payloadShort: Record<string, string> = {};
    if (typeof body.img === 'string') payloadShort.i = body.img;
    if (typeof body.title === 'string') payloadShort.t = body.title;
    if (typeof body.description === 'string') payloadShort.d = body.description;
    if (typeof body.alt === 'string') payloadShort.a = body.alt;
    if (typeof body.url === 'string') payloadShort.u = body.url;

    const jsonStr = JSON.stringify(payloadShort);
    const uint8 = new TextEncoder().encode(jsonStr);
    const brotliToken = toBase64Url(
      brotliCompressSync(uint8, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        },
      })
    );
    const deflateToken = toBase64Url(deflateRawSync(uint8, { level: 9 }));
    const token =
      deflateToken.length < brotliToken.length ? deflateToken : brotliToken;

    const origin = (() => {
      try {
        // Prefer x-forwarded-host when behind proxy
        const proto = req.headers.get('x-forwarded-proto') || 'https';
        const host =
          req.headers.get('x-forwarded-host') || req.headers.get('host');
        if (host) return `${proto}://${host}`;
        return '';
      } catch {
        return '';
      }
    })();

    const shareUrl = origin ? `${origin}/s/${token}` : `/s/${token}`;

    return NextResponse.json({ t: token, shareUrl });
  } catch (_err) {
    return NextResponse.json({ error: 'encode_failed' }, { status: 400 });
  }
}
