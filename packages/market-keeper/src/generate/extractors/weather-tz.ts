/**
 * City -> UTC offset (hours) for the Polymarket daily-temperature markets.
 *
 * Values are the *June* offset (DST-aware where applicable) since these markets
 * are summer-dated; they decide the local end-of-day the labels are pinned to.
 * For year-round correctness this would become IANA zones + a tz library, but a
 * static summer table is exact for the current snapshot. City names in the
 * corpus are ASCII (e.g. "Sao Paulo"), so a plain lowercase key matches.
 */
export const CITY_TZ_JUNE: Record<string, number> = {
  // East Asia (no DST)
  tokyo: 9,
  seoul: 9,
  busan: 9,
  'hong kong': 8,
  shanghai: 8,
  beijing: 8,
  qingdao: 8,
  guangzhou: 8,
  shenzhen: 8,
  chongqing: 8,
  chengdu: 8,
  wuhan: 8,
  taipei: 8,
  singapore: 8,
  'kuala lumpur': 8,
  manila: 8,
  // South Asia
  karachi: 5,
  lucknow: 5.5,
  // Middle East / Turkey (no DST)
  jeddah: 3,
  'tel aviv': 3,
  istanbul: 3,
  ankara: 3,
  // Europe (summer DST)
  london: 1,
  paris: 2,
  amsterdam: 2,
  milan: 2,
  madrid: 2,
  munich: 2,
  warsaw: 2,
  helsinki: 3,
  moscow: 3,
  // Africa
  'cape town': 2,
  // North America (summer DST)
  'new york city': -4,
  miami: -4,
  atlanta: -4,
  toronto: -4,
  chicago: -5,
  austin: -5,
  houston: -5,
  dallas: -5,
  'panama city': -5,
  denver: -6,
  'mexico city': -6,
  'los angeles': -7,
  'san francisco': -7,
  seattle: -7,
  // South America (no DST)
  'sao paulo': -3,
  'buenos aires': -3,
  // Oceania (June = winter, standard)
  wellington: 12,
};

/** June UTC offset (hours) for a city, or null if unknown. */
export function cityOffsetJune(city: string): number | null {
  const key = city.toLowerCase().trim();
  return key in CITY_TZ_JUNE ? CITY_TZ_JUNE[key] : null;
}
