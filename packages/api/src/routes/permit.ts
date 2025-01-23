import { Router, Request, Response } from 'express';

const router = Router();

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

async function getIpInfo(ip: string) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
  if (!response.ok) return null;

  return response.json();
}

async function isGeofenced(ip: string | null) {
  if (!process.env.IPINFO_TOKEN) return false;
  if (!ip) return true;

  console.log('Checking ', ip);
  const ipInfo = await getIpInfo(ip);
  if (!ipInfo) return true;
  console.log('IP Info:', JSON.stringify(ipInfo, null, 2));

  return GEOFENCED_COUNTRIES.includes(ipInfo.country) || ipInfo.privacy?.vpn;
}

const getClientIp = (req: Request): string | null => {
  // Check X-Forwarded-For header first (common for proxies)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Get the first IP if it's a comma-separated list
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips.trim();
  }

  // Check other common headers
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to connection remote address
  return req.socket.remoteAddress || null;
};

router.get('/permit', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const isBlocked = await isGeofenced(ip);
    res.json({ permitted: !isBlocked });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to check permit status: ${error!.toString()}` });
  }
});

export default router;
