/**
 * Deterministic short name generation for Polymarket markets
 * Returns null if no pattern matches (signals to use LLM)
 */

import type { PolymarketMarket } from '../types';
import { parseOutcomes } from './transform';

// Team abbreviations - NBA, NFL, eSports
const TEAM_ABBREVIATIONS: Record<string, string> = {
  // NBA
  Lakers: 'LAL',
  Celtics: 'BOS',
  Warriors: 'GSW',
  Knicks: 'NYK',
  Bulls: 'CHI',
  Heat: 'MIA',
  Nuggets: 'DEN',
  Suns: 'PHX',
  Bucks: 'MIL',
  Cavaliers: 'CLE',
  '76ers': 'PHI',
  Sixers: 'PHI',
  Mavericks: 'DAL',
  Clippers: 'LAC',
  Kings: 'SAC',
  Hawks: 'ATL',
  Nets: 'BKN',
  Jazz: 'UTA',
  Timberwolves: 'MIN',
  Pelicans: 'NOP',
  Rockets: 'HOU',
  Spurs: 'SAS',
  Magic: 'ORL',
  Pacers: 'IND',
  Hornets: 'CHA',
  Raptors: 'TOR',
  Wizards: 'WAS',
  Thunder: 'OKC',
  Blazers: 'POR',
  Pistons: 'DET',
  Grizzlies: 'MEM',

  // NFL
  Chiefs: 'KC',
  Eagles: 'PHI',
  Bills: 'BUF',
  Cowboys: 'DAL',
  Dolphins: 'MIA',
  Ravens: 'BAL',
  Bengals: 'CIN',
  Lions: 'DET',
  Packers: 'GB',
  '49ers': 'SF',
  Seahawks: 'SEA',
  Commanders: 'WAS',
  Steelers: 'PIT',
  Browns: 'CLE',
  Chargers: 'LAC',
  Raiders: 'LV',
  Broncos: 'DEN',
  Vikings: 'MIN',
  Bears: 'CHI',
  Saints: 'NO',
  Buccaneers: 'TB',
  Falcons: 'ATL',
  Panthers: 'CAR',
  Cardinals: 'ARI',
  Rams: 'LAR',
  Giants: 'NYG',
  Jets: 'NYJ',
  Patriots: 'NE',
  Colts: 'IND',
  Texans: 'HOU',
  Jaguars: 'JAX',
  Titans: 'TEN',

  // MLB
  Yankees: 'NYY',
  Dodgers: 'LAD',
  'Red Sox': 'BOS',
  Mets: 'NYM',
  Cubs: 'CHC',
  Astros: 'HOU',
  Braves: 'ATL',
  Phillies: 'PHI',

  // eSports
  Vitality: 'VIT',
  NaVi: 'NAVI',
  'Natus Vincere': 'NAVI',
  G2: 'G2',
  Fnatic: 'FNC',
  Cloud9: 'C9',
  'Team Liquid': 'TL',
  'Team Spirit': 'TS',
  Astralis: 'AST',
  FaZe: 'FAZE',
  MOUZ: 'MOUZ',
  Heroic: 'HRC',
  ENCE: 'ENCE',
  BIG: 'BIG',
  Complexity: 'COL',
  'Evil Geniuses': 'EG',
  '100 Thieves': '100T',
  Sentinels: 'SEN',
  LOUD: 'LOUD',
  DRX: 'DRX',
  Gen: 'GEN',
  T1: 'T1',
};

// Asset abbreviations for crypto/finance
const ASSET_ABBREVIATIONS: Record<string, string> = {
  Bitcoin: 'BTC',
  Ethereum: 'ETH',
  Solana: 'SOL',
  XRP: 'XRP',
  Cardano: 'ADA',
  Dogecoin: 'DOGE',
  Polkadot: 'DOT',
  Avalanche: 'AVAX',
  Chainlink: 'LINK',
  Polygon: 'MATIC',
  'S&P 500': 'SPX',
  'S&P 500 (SPX)': 'SPX',
  Nasdaq: 'NDX',
  'Dow Jones': 'DJI',
  Gold: 'XAU',
  Silver: 'XAG',
  Tesla: 'TSLA',
  Apple: 'AAPL',
  Microsoft: 'MSFT',
  Amazon: 'AMZN',
  Google: 'GOOG',
  Meta: 'META',
  Nvidia: 'NVDA',
};

// Stat abbreviations for player props
const STAT_ABBREVIATIONS: Record<string, string> = {
  points: 'pts',
  rebounds: 'reb',
  assists: 'ast',
  steals: 'stl',
  blocks: 'blk',
  turnovers: 'to',
  '3-pointers': '3pts',
  'fantasy points': 'fpts',
};

// Month abbreviations
const MONTH_ABBREVIATIONS: Record<string, string> = {
  january: 'Jan',
  february: 'Feb',
  march: 'Mar',
  april: 'Apr',
  may: 'May',
  june: 'Jun',
  july: 'Jul',
  august: 'Aug',
  september: 'Sep',
  october: 'Oct',
  november: 'Nov',
  december: 'Dec',
};

/**
 * Get team abbreviation - lookup or generate
 * Fallback: first 3 consonants, or first 3 letters, or full name if <3 chars
 */
function getTeamAbbreviation(name: string): string {
  const trimmed = name.trim();

  // Check mapping first
  if (TEAM_ABBREVIATIONS[trimmed]) {
    return TEAM_ABBREVIATIONS[trimmed];
  }

  // If name is 3 chars or less, return as-is
  if (trimmed.length <= 3) {
    return trimmed.toUpperCase();
  }

  // If name starts with a vowel, use first 3 letters (more recognizable)
  if (/^[aeiou]/i.test(trimmed)) {
    const letters = trimmed.replace(/[^a-z]/gi, '');
    return letters.slice(0, 3).toUpperCase();
  }

  // Try first 3 consonants (alphabetic only, exclude hyphens/punctuation)
  const consonants = trimmed.replace(/[^bcdfghjklmnpqrstvwxyz]/gi, '');
  if (consonants.length >= 3) {
    return consonants.slice(0, 3).toUpperCase();
  }

  // Fall back to first 3 letters
  return trimmed.slice(0, 3).toUpperCase();
}

/**
 * Get asset abbreviation - lookup or return as-is
 */
function getAssetAbbreviation(name: string): string {
  const trimmed = name.trim();
  return ASSET_ABBREVIATIONS[trimmed] || trimmed;
}

/**
 * Extract and abbreviate month from date string
 */
function getMonthAbbreviation(dateStr: string): string {
  const lower = dateStr.toLowerCase();
  for (const [month, abbrev] of Object.entries(MONTH_ABBREVIATIONS)) {
    if (lower.includes(month)) {
      // Try to extract day number
      const dayMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?/);
      const day = dayMatch ? dayMatch[1] : '';
      return `${abbrev}${day}`;
    }
  }
  return dateStr;
}

/**
 * Infer short name from market question using deterministic rules
 * Returns null if no pattern matches (signals to use LLM)
 */
export function inferShortName(market: PolymarketMarket): string | null {
  const question = market.question;
  const outcomes = parseOutcomes(market.outcomes);

  // Rule 1: Player props - "Player: Stat Over X.X"
  const playerPropMatch = question.match(
    /^(.+?):\s+(Points|Rebounds|Assists|Steals|Blocks|Turnovers|3-Pointers|Fantasy Points)\s+Over\s+(\d+(?:\.\d+)?)$/i
  );
  if (playerPropMatch) {
    const [, player, stat, value] = playerPropMatch;
    const lastName = player.split(' ').pop() || player;
    const statAbbrev = STAT_ABBREVIATIONS[stat.toLowerCase()] || '';
    return `${lastName} O${value}${statAbbrev}`;
  }

  // Rule 2: Over/Under totals - "X vs. Y: O/U X.X" or "X vs. Y: 1H O/U X.X"
  const ouMatch = question.match(
    /^(.+?)\s+vs\.?\s+(.+?):\s+(?:(1H|2H|1Q|2Q|3Q|4Q)\s+)?O\/U\s+(\d+(?:\.\d+)?)$/i
  );
  if (ouMatch) {
    const [, team1, team2, period, total] = ouMatch;
    const abbrev1 = getTeamAbbreviation(team1);
    const abbrev2 = getTeamAbbreviation(team2);
    const periodStr = period ? ` ${period}` : '';
    return `${abbrev1}/${abbrev2}${periodStr} O${total}`;
  }

  // Rule 3: Spread markets - "Spread: Team (-X.5)" or "1H Spread: Team (-X.5)"
  const spreadMatch = question.match(
    /^(?:(\S+)\s+)?Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/i
  );
  if (spreadMatch) {
    const [, period, team, spread] = spreadMatch;
    const abbrev = getTeamAbbreviation(team);
    const periodStr = period ? ` ${period}` : '';
    return `${abbrev} ${spread}${periodStr}`;
  }

  // Rule 4: Team matchups - "X vs. Y" (with team name outcomes)
  const standardOutcomes = ['Yes', 'No', 'Over', 'Under', 'Up', 'Down'];
  const hasTeamOutcomes =
    outcomes.length === 2 &&
    !standardOutcomes.includes(outcomes[0]) &&
    !standardOutcomes.includes(outcomes[1]);

  if (hasTeamOutcomes) {
    const vsMatch = question.match(/^(?:.+?:\s+)?(.+?)\s+vs\.?\s+(.+?)(?:\s*[-:].+)?$/i);
    if (vsMatch) {
      const abbrev1 = getTeamAbbreviation(outcomes[0]);
      const abbrev2 = getTeamAbbreviation(outcomes[1]);
      return `${abbrev1} win vs ${abbrev2}`;
    }
  }

  // Rule 5: Both Teams to Score - "X vs. Y: Both Teams to Score"
  const bttsMatch = question.match(/^(.+?)\s+vs\.?\s+(.+?):\s+Both\s+Teams\s+to\s+Score$/i);
  if (bttsMatch) {
    const [, team1, team2] = bttsMatch;
    const abbrev1 = getTeamAbbreviation(team1);
    const abbrev2 = getTeamAbbreviation(team2);
    return `BTTS ${abbrev1}/${abbrev2}`;
  }

  // Rule 6: eSports maps - "X to win N maps?"
  const mapsMatch = question.match(/^(.+?)\s+to\s+win\s+(\d+)\s+maps?\?$/i);
  if (mapsMatch) {
    const [, team, count] = mapsMatch;
    const abbrev = getTeamAbbreviation(team);
    return `${abbrev} ${count}+ maps`;
  }

  // Rule 7: Handicap markets - "Map/Game Handicap: Team (-X.5)"
  const handicapMatch = question.match(
    /^(?:(\S+)\s+)?(?:Map\s+|Game\s+)?Handicap:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/i
  );
  if (handicapMatch) {
    const [, , team, handicap] = handicapMatch;
    const abbrev = getTeamAbbreviation(team);
    return `${abbrev} ${handicap}`;
  }

  // Rule 8: Price movement - "Asset Up or Down - Date" or "Asset Up or Down on Date?"
  const priceMatch = question.match(/^(.+?)\s+Up\s+or\s+Down\s+(?:-\s+|on\s+)(.+?)(?:\?)?$/i);
  if (priceMatch) {
    const [, asset, dateStr] = priceMatch;
    const abbrev = getAssetAbbreviation(asset);
    const dateAbbrev = getMonthAbbreviation(dateStr);
    return `${abbrev} up ${dateAbbrev}`;
  }

  // Rule 9: Elon tweets
  const elonTweetMatch = question.match(
    /Will\s+Elon\s+(?:Musk\s+)?(?:tweet|post).+?about\s+(.+?)\??$/i
  );
  if (elonTweetMatch) {
    const [, topic] = elonTweetMatch;
    const topicAbbrev = getAssetAbbreviation(topic);
    return `Elon tweets ${topicAbbrev}`;
  }

  const elonCountMatch = question.match(
    /Elon\s+(?:Musk\s+)?(?:tweets?|posts?)\s+(\d+[-\d]*)\+?\s+(?:times\s+)?(.+?)(?:\?)?$/i
  );
  if (elonCountMatch) {
    const [, count, period] = elonCountMatch;
    const dateAbbrev = getMonthAbbreviation(period);
    return `Elon ${count}+ ${dateAbbrev}`;
  }

  // Rule 10: Fed/economic - "Fed rate cut/hike Month?"
  const fedMatch = question.match(
    /\b(fed|federal\s+reserve)\b.+?(cut|hike|raise|hold).+?(\w+(?:\s+\d+)?)/i
  );
  if (fedMatch) {
    const [, , action, period] = fedMatch;
    const actionAbbrev = action.toLowerCase() === 'raise' ? 'hike' : action.toLowerCase();
    const dateAbbrev = getMonthAbbreviation(period);
    return `Fed ${actionAbbrev} ${dateAbbrev}`;
  }

  // Rule 11: Crypto thresholds - "Bitcoin above/below $X?"
  const cryptoThresholdMatch = question.match(
    /\b(bitcoin|btc|ethereum|eth|solana|sol)\b.+?(above|below|over|under)\s*\$?([\d,]+k?)/i
  );
  if (cryptoThresholdMatch) {
    const [, asset, comparison, value] = cryptoThresholdMatch;
    const abbrev = getAssetAbbreviation(asset.charAt(0).toUpperCase() + asset.slice(1));
    const symbol = comparison === 'above' || comparison === 'over' ? '>' : '<';
    return `${abbrev} ${symbol}$${value}`;
  }

  // Rule 12: Price between range - "Will the price of X be between $Y and $Z on Date?"
  const priceBetweenMatch = question.match(
    /price\s+of\s+(\w+)\s+be\s+between\s+\$?([\d,]+)\s+and\s+\$?([\d,]+)/i
  );
  if (priceBetweenMatch) {
    const [, asset, low, high] = priceBetweenMatch;
    const abbrev = getAssetAbbreviation(asset);
    return `${abbrev} $${low}-${high}`;
  }

  // Rule 13: Price above/below on date - "Will the price of X be above/below $Y on Date?"
  const priceAboveBelowMatch = question.match(
    /price\s+of\s+(\w+)\s+be\s+(above|below|greater\s+than|less\s+than)\s+\$?([\d,]+)/i
  );
  if (priceAboveBelowMatch) {
    const [, asset, comparison, value] = priceAboveBelowMatch;
    const abbrev = getAssetAbbreviation(asset);
    const symbol = comparison.includes('above') || comparison.includes('greater') ? '>' : '<';
    return `${abbrev} ${symbol}$${value}`;
  }

  // Rule 14: Crypto reach/dip - "Will Bitcoin reach/dip to $X Date?"
  const cryptoReachDipMatch = question.match(
    /(\w+)\s+(reach|dip\s+to)\s+\$?([\d,]+)/i
  );
  if (cryptoReachDipMatch) {
    const [, asset, action, value] = cryptoReachDipMatch;
    const abbrev = getAssetAbbreviation(asset);
    const actionAbbrev = action.toLowerCase().includes('dip') ? 'dip' : 'reach';
    return `${abbrev} ${actionAbbrev} $${value}`;
  }

  // Rule 15: Temperature increase - "Will global temperature increase by X in Month?"
  const tempMatch = question.match(
    /temperature\s+increase\s+by\s+(?:between\s+)?([\d.]+)(?:º?C)?(?:\s+and\s+([\d.]+)(?:º?C)?)?\s+in\s+(\w+)/i
  );
  if (tempMatch) {
    const [, low, high, month] = tempMatch;
    const monthAbbrev = getMonthAbbreviation(month);
    if (high) {
      return `Temp +${low}-${high}C ${monthAbbrev}`;
    }
    return `Temp +${low}C ${monthAbbrev}`;
  }

  // Rule 16: Team total O/U - "Team Team Total: O/U X.X"
  const teamTotalMatch = question.match(
    /^(.+?)\s+Team\s+Total:\s+O\/U\s+(\d+(?:\.\d+)?)$/i
  );
  if (teamTotalMatch) {
    const [, team, total] = teamTotalMatch;
    const abbrev = getTeamAbbreviation(team);
    return `${abbrev} Total O${total}`;
  }

  // No pattern matched - return null to signal LLM should be used
  return null;
}
