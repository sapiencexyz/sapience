import { NextResponse, type NextRequest } from 'next/server';

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

function isDebug(req: NextRequest) {
  const hasDebugCookie = req.cookies.get('debug')?.value === 'true';
  const hasDebugParam = req.nextUrl.searchParams.has('debug');
  return hasDebugCookie || hasDebugParam;
}

async function getIpInfo(ip: string) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
  if (!response.ok) return null;

  return response.json();
}

async function isGeofenced(req: NextRequest) {
  if (!process.env.IPINFO_TOKEN) return false;
  if (!req.ip) return true;

  if (isDebug(req)) return false;

  const ipInfo = await getIpInfo(req.ip);
  if (!ipInfo) return true;

  return GEOFENCED_COUNTRIES.includes(ipInfo.country) || ipInfo.privacy?.vpn;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.searchParams.has('debug')) {
    response.cookies.set('debug', 'true');
  }

  if (process.env.NODE_ENV === 'production' && (await isGeofenced(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
