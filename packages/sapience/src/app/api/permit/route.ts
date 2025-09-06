export const runtime = 'edge';

const GEOFENCED_COUNTRIES = [
  'US',
  'BY',
  'CU',
  'IR',
  'KP',
  'RU',
  'SY',
  'UA',
  'MM',
];

function getClientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor && forwardedFor.length > 0) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp && realIp.length > 0) return realIp;
  return null;
}

async function getIpInfo(ip: string) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function isGeofenced(ip: string | null) {
  if (!process.env.IPINFO_TOKEN) return false;
  if (!ip) return true;
  const ipInfo = await getIpInfo(ip);
  if (!ipInfo) return true;
  return GEOFENCED_COUNTRIES.includes(ipInfo.country);
}

function corsHeaders(origin: string | null) {
  // Reflect origin if provided, otherwise allow all for simplicity
  const allowOrigin = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  } as Record<string, string>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');

  // If this is called from the client, we include CORS headers. Server-side calls can ignore.
  const includeCors = !!origin || url.searchParams.get('cors') === '1';
  const baseHeaders = includeCors ? corsHeaders(origin) : {};

  try {
    const ip = getClientIpFromHeaders(req.headers);
    const blocked = await isGeofenced(ip);
    return new Response(JSON.stringify({ permitted: !blocked }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...baseHeaders,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Failed to check permit status: ${String(error)}`,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...baseHeaders,
        },
      }
    );
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}


