/**
 * Category inference for Polymarket markets
 */

import type { PolymarketMarket, SapienceCategorySlug } from '../types';

export function inferSapienceCategorySlug(market: PolymarketMarket): SapienceCategorySlug {
  // Build normalized text for keyword matching
  const searchText = [
    market.question,
    market.slug,
    market.events?.[0]?.title,
    market.events?.[0]?.series?.[0]?.slug,
    market.events?.[0]?.series?.[0]?.title,
    market.events?.[0]?.seriesSlug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // 1. Sports: Check sportsMarketType or series slugs
  if (market.sportsMarketType ||
      /\b(pga|nba|nfl|nhl|mlb|epl|premier-league|uefa|fifa|world-cup|super-bowl|bowl|playoff|championship|bundesliga|la-liga|serie-a|ligue-1|champions-league|valorant|league-of-legends|dota|soccer|football|basketball|baseball|hockey|tennis|golf|ufc|boxing|mma|formula-1|cricket|rugby|buccaneers|chiefs|eagles|49ers|cowboys|packers|patriots|lakers|warriors|celtics|yankees|dodgers|mets|red-sox)\b/.test(searchText)) {
    return 'sports';
  }

  // 2. Crypto: Check for crypto keywords
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|crypto|cryptocurrency|blockchain|defi|nft|satoshi)\b/.test(searchText)) {
    return 'crypto';
  }

  // 3. Weather: Check for weather/climate keywords
  if (/\b(weather|temperature|hottest|coldest|hurricane|tornado|flood|drought|rain|snow|climate|celsius|fahrenheit|el-nino)\b/.test(searchText)) {
    return 'weather';
  }

  // 4. Tech & Science: Check for tech/science keywords
  if (/\b(ai|artificial-intelligence|chatgpt|openai|tech|technology|science|nasa|spacex|tesla|apple|google|microsoft|amazon|meta|robot|quantum|semiconductor|chip)\b/.test(searchText)) {
    return 'tech-science';
  }

  // 5. Economy & Finance: Check for financial keywords
  if (/\b(stock|stocks|s&p|spx|dow|nasdaq|earning|market|fed|federal-reserve|interest-rate|inflation|gdp|economy|economic|finance|financial|bank|dollar|euro|yen|bond|treasury)\b/.test(searchText)) {
    return 'economy-finance';
  }

  // 6. Geopolitics: Check for politics/elections/war keywords
  if (/\b(election|president|presidential|senate|senator|congress|governor|prime-minister|parliament|vote|voting|poll|republican|democrat|party|political|politics|war|military|nato|ukraine|russia|china|israel|palestine|iran|korea|taiwan|diplomacy|treaty|sanction)\b/.test(searchText)) {
    return 'geopolitics';
  }

  // 7. Culture: Check for entertainment/celebrity/social media keywords
  if (/\b(oscar|emmy|grammy|award|movie|film|music|album|celebrity|actor|actress|director|streaming|netflix|spotify|pop-culture|entertainment|fashion|art|artist|tweet|tweets|elon-musk|elon|twitter|x-post|post-on-x)\b/.test(searchText)) {
    return 'culture';
  }

  // Default fallback: unknown (will trigger LLM categorization)
  return 'unknown';
}
