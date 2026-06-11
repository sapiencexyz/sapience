import { getDstAwareOffsetHours } from '../endtime';

/**
 * City -> IANA timezone for the Polymarket daily-temperature markets.
 *
 * Weather markets resolve at local end-of-day for the city in the title. Use
 * IANA zones instead of fixed summer offsets so winter markets land on EST/GMT
 * rather than stale EDT/BST offsets. City names in the corpus are ASCII (e.g.
 * "Sao Paulo"), so a plain lowercase key matches.
 */
export const CITY_TIMEZONE: Record<string, string> = {
  // East Asia (no DST)
  tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  busan: 'Asia/Seoul',
  'hong kong': 'Asia/Hong_Kong',
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  qingdao: 'Asia/Shanghai',
  guangzhou: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai',
  chongqing: 'Asia/Shanghai',
  chengdu: 'Asia/Shanghai',
  wuhan: 'Asia/Shanghai',
  taipei: 'Asia/Taipei',
  singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur',
  manila: 'Asia/Manila',
  // South Asia
  karachi: 'Asia/Karachi',
  lucknow: 'Asia/Kolkata',
  // Middle East / Turkey
  jeddah: 'Asia/Riyadh',
  'tel aviv': 'Asia/Jerusalem',
  istanbul: 'Europe/Istanbul',
  ankara: 'Europe/Istanbul',
  // Europe
  london: 'Europe/London',
  paris: 'Europe/Paris',
  amsterdam: 'Europe/Amsterdam',
  milan: 'Europe/Rome',
  madrid: 'Europe/Madrid',
  munich: 'Europe/Berlin',
  warsaw: 'Europe/Warsaw',
  helsinki: 'Europe/Helsinki',
  moscow: 'Europe/Moscow',
  // Africa
  'cape town': 'Africa/Johannesburg',
  // North America
  'new york city': 'America/New_York',
  miami: 'America/New_York',
  atlanta: 'America/New_York',
  toronto: 'America/Toronto',
  chicago: 'America/Chicago',
  austin: 'America/Chicago',
  houston: 'America/Chicago',
  dallas: 'America/Chicago',
  'panama city': 'America/Panama',
  denver: 'America/Denver',
  'mexico city': 'America/Mexico_City',
  'los angeles': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  // South America
  'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  // Oceania
  wellington: 'Pacific/Auckland',
};

/** IANA timezone for a city, or null if unknown. */
export function cityTimezone(city: string): string | null {
  const key = city.toLowerCase().trim();
  return key in CITY_TIMEZONE ? CITY_TIMEZONE[key] : null;
}

/** UTC offset (hours) for a city on a specific date, or null if unknown. */
export function cityOffsetForDate(
  city: string,
  year: number,
  month: number,
  day: number
): number | null {
  const zone = cityTimezone(city);
  if (!zone) return null;
  return getDstAwareOffsetHours(year, month, day, zone);
}
