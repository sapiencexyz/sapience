import { NextResponse, type NextRequest } from 'next/server';
import IPinfoWrapper from 'node-ipinfo';

const ipinfoWrapper = process.env.IPINFO_TOKEN
  ? new IPinfoWrapper(process.env.IPINFO_TOKEN)
  : null;

const GEOFENCED_COUNTRIES = ['US'];

function isDebug(req: NextRequest) {
  return (
    req.cookies.get('debug')?.value === 'true' ||
    req.nextUrl.searchParams.has('debug')
  );
}

async function isGeofenced(req: NextRequest) {
  if (!ipinfoWrapper) return false;
  if (!req.ip) return true;

  if (isDebug(req)) return false;

  const response = await ipinfoWrapper.lookupIp(req.ip);
  return GEOFENCED_COUNTRIES.includes(response.country) || response.privacy.vpn;
}

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && (await !isGeofenced(request))) {
    return new NextResponse('Authentication required', {
      status: 403,
      headers: { 'WWW-Authenticate': 'Basic' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
