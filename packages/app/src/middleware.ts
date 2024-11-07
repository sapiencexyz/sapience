import { NextResponse, type NextRequest } from 'next/server';
import IPinfoWrapper from 'node-ipinfo';

const ipinfoWrapper = process.env.IPINFO_TOKEN
  ? new IPinfoWrapper(process.env.IPINFO_TOKEN)
  : null;

const GEOFENCED_COUNTRIES = ['US'];

function isDebug(req: NextRequest) {
  const hasDebugCookie = req.cookies.get('debug')?.value === 'true';
  const hasDebugParam = req.nextUrl.searchParams.has('debug');
  return hasDebugCookie || hasDebugParam;
}

async function isGeofenced(req: NextRequest) {
  if (!ipinfoWrapper) return false;
  if (!req.ip) return true;

  if (isDebug(req)) return false;

  const response = await ipinfoWrapper.lookupIp(req.ip);
  return GEOFENCED_COUNTRIES.includes(response.country) || response.privacy.vpn;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.searchParams.has('debug')) {
    response.cookies.set('debug', 'true');
  }

  if (process.env.NODE_ENV === 'production' && (await !isGeofenced(request))) {
    return new NextResponse('Authentication required', {
      status: 403,
      headers: { 'WWW-Authenticate': 'Basic' },
    });
  }
  return response;
}

export const config = {
  matcher: '/:path*',
};
