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

type IpInfoResponse = {
  country?: string;
};

async function getIpInfo(ip: string) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
    if (!response.ok) return null;
    return (await response.json()) as IpInfoResponse;
  } catch {
    return null;
  }
}

type GeofenceResult = {
  blocked: boolean;
  country: string | null;
};

async function getGeofenceResult(ip: string | null): Promise<GeofenceResult> {
  if (!process.env.IPINFO_TOKEN) {
    return { blocked: false, country: null };
  }

  if (!ip) {
    return { blocked: true, country: null };
  }

  const ipInfo = await getIpInfo(ip);
  if (!ipInfo || !ipInfo.country) {
    return { blocked: true, country: null };
  }

  return {
    blocked: GEOFENCED_COUNTRIES.includes(ipInfo.country),
    country: ipInfo.country,
  };
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

    // Development override: allow forcing geofence locally without relying on IP.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.FORCE_GEOFENCE_LOCAL === '1'
    ) {
      const body: Record<string, unknown> = {
        permitted: false,
        country: null,
      };

      // Optional debug information in development when requested.
      if (url.searchParams.get('debug') === '1') {
        body.ip = ip;
        body.tokenPresent = !!process.env.IPINFO_TOKEN;
        body.reason = 'FORCE_GEOFENCE_LOCAL override';
      }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...baseHeaders,
        },
      });
    }

    const { blocked, country } = await getGeofenceResult(ip);

    const body: Record<string, unknown> = {
      permitted: !blocked,
      country,
    };

    // Optional debug information in development when requested.
    if (
      process.env.NODE_ENV !== 'production' &&
      url.searchParams.get('debug') === '1'
    ) {
      body.ip = ip;
      body.tokenPresent = !!process.env.IPINFO_TOKEN;
    }

    return new Response(JSON.stringify(body), {
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
