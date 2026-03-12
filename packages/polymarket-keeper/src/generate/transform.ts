/**
 * Question transformation and parsing utilities
 */

import type { PolymarketMarket } from '../types';

export function parseOutcomes(outcomes: string[] | string): string[] {
  if (Array.isArray(outcomes)) return outcomes;
  if (typeof outcomes === 'string') {
    try {
      const parsed = JSON.parse(outcomes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getPolymarketUrl(market: PolymarketMarket): string {
  // Simple reference URL with slug
  // Note: Polymarket URLs vary by market type (event, sports, etc.)
  // so we just provide a reference with the slug identifier
  return `https://polymarket.com#${market.slug}`;
}

/**
 * Transform market questions to clear Yes/No formats:
 *
 * Over/Under & Standard Outcome Patterns:
 * - "X vs. Y: O/U X.X" -> "Will X vs Y total be over X.X?"
 * - "X vs. Y: 1H O/U X.X" -> "Will X vs Y 1H total be over X.X?"
 * - "Player: Points Over X.X" -> "Will Player score over X.X points?"
 * - "Total Rounds Over/Under X.X" -> "Will total rounds be over X.X?"
 * - "Games Total: O/U X.X" -> "Will total games be over X.X?"
 * - "Team to win N maps?" -> "Will Team win at least N map(s)?"
 * - "X vs. Y: Both Teams to Score" -> "Will both X and Y score?"
 * - "Asset Up or Down - Date" -> "Will Asset go up on Date?"
 *
 * Team Name Outcome Patterns:
 * - "X vs. Y" -> "X beats Y? (context)"
 * - "Spread: Team (-X.5)" -> "Team covers -X.5 spread vs Opponent?"
 * - "Map/Game Handicap: Team (-X.5)" -> "Team covers -X.5 handicap vs Opponent?"
 * - "Series Team Type Handicap (-X.X)" -> "Will Team cover the -X.X type handicap vs Opponent?"
 * - "Series: Most X?" -> "Team gets most X?"
 *
 * Preserves prefix/suffix context from original question.
 * The first outcome in Polymarket = "Yes" = first team wins/covers/gets most
 */
export function transformMatchQuestion(market: PolymarketMarket): string {
  const outcomes = parseOutcomes(market.outcomes);

  // Skip if not exactly 2 outcomes
  if (outcomes.length !== 2) return market.question;

  // ============ Handle Over/Under and Yes/No outcome patterns FIRST ============
  // These patterns have standard outcomes but still need question transformation

  // "X vs. Y: O/U X.X" or "X vs. Y: 1H O/U X.X" - Over/Under totals
  // e.g., "Jazz vs. Bulls: O/U 244.5" -> "Will Jazz vs Bulls total be over 244.5?"
  const ouMatch = market.question.match(/^(.+?)\s+vs\.?\s+(.+?):\s+(?:(1H|2H|1Q|2Q|3Q|4Q)\s+)?O\/U\s+(\d+(?:\.\d+)?)$/i);
  if (ouMatch) {
    const [, team1, team2, period, total] = ouMatch;
    const periodText = period ? `${period} ` : '';
    const transformed = `Will ${team1} vs ${team2} ${periodText}total be over ${total}?`;
    console.log(`[Transform O/U] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "Player: Stat Over X.X" - Player props
  // e.g., "Coby White: Points Over 20.5" -> "Will Coby White score over 20.5 points?"
  const playerPropMatch = market.question.match(/^(.+?):\s+(Points|Rebounds|Assists|Steals|Blocks|Turnovers|3-Pointers|Fantasy Points)\s+Over\s+(\d+(?:\.\d+)?)$/i);
  if (playerPropMatch) {
    const [, player, stat, value] = playerPropMatch;
    const statLower = stat.toLowerCase();
    let verb = 'get';
    if (statLower === 'points') verb = 'score';
    else if (statLower === 'assists') verb = 'record';
    else if (statLower === 'rebounds') verb = 'grab';
    const transformed = `Will ${player} ${verb} over ${value} ${statLower}?`;
    console.log(`[Transform Player Prop] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "Total Rounds Over/Under X.X" - eSports round totals
  // e.g., "Total Rounds Over/Under 45.5" -> "Will total rounds be over 45.5?"
  const totalRoundsMatch = market.question.match(/^Total\s+Rounds\s+Over\/Under\s+(\d+(?:\.\d+)?)$/i);
  if (totalRoundsMatch) {
    const [, total] = totalRoundsMatch;
    const transformed = `Will total rounds be over ${total}?`;
    console.log(`[Transform Total Rounds] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "Games Total: O/U X.X" - eSports games total
  // e.g., "Games Total: O/U 2.5" -> "Will total games be over 2.5?"
  const gamesTotalMatch = market.question.match(/^Games\s+Total:\s+O\/U\s+(\d+(?:\.\d+)?)$/i);
  if (gamesTotalMatch) {
    const [, total] = gamesTotalMatch;
    const transformed = `Will total games be over ${total}?`;
    console.log(`[Transform Games Total] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "X to win N maps?" - eSports maps
  // e.g., "Vitality to win 1 maps?" -> "Will Vitality win at least 1 map?"
  const mapsWinMatch = market.question.match(/^(.+?)\s+to\s+win\s+(\d+)\s+maps?\?$/i);
  if (mapsWinMatch) {
    const [, team, count] = mapsWinMatch;
    const mapWord = count === '1' ? 'map' : 'maps';
    const transformed = `Will ${team} win at least ${count} ${mapWord}?`;
    console.log(`[Transform Maps Win] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "X vs. Y: Both Teams to Score" - Soccer BTTS
  // e.g., "RB Leipzig vs. SC Freiburg: Both Teams to Score" -> "Will both RB Leipzig and SC Freiburg score?"
  const bttsMatch = market.question.match(/^(.+?)\s+vs\.?\s+(.+?):\s+Both\s+Teams\s+to\s+Score$/i);
  if (bttsMatch) {
    const [, team1, team2] = bttsMatch;
    const transformed = `Will both ${team1} and ${team2} score?`;
    console.log(`[Transform BTTS] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // "X Up or Down - Date" or "X Up or Down on Date?" - Price movement
  // e.g., "Solana Up or Down - January 14, 2PM ET" -> "Will Solana go up on January 14, 2PM ET?"
  // e.g., "S&P 500 (SPX) Up or Down on January 14?" -> "Will S&P 500 (SPX) go up on January 14?"
  const upDownMatch = market.question.match(/^(.+?)\s+Up\s+or\s+Down\s+(?:-\s+|on\s+)(.+?)(?:\?)?$/i);
  if (upDownMatch) {
    const [, asset, dateTime] = upDownMatch;
    const transformed = `Will ${asset} go up on ${dateTime}?`;
    console.log(`[Transform Up/Down] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // ============ End Over/Under and Yes/No patterns ============

  // Skip if outcomes are standard Yes/No or Over/Under (not team names)
  // These remaining patterns require team name outcomes
  const standardOutcomes = ['Yes', 'No', 'Over', 'Under', 'Up', 'Down'];
  if (standardOutcomes.includes(outcomes[0]) || standardOutcomes.includes(outcomes[1])) {
    return market.question;
  }

  // Detect spread markets: "1H Spread: Team (-X.5)" or "Spread: Team (-X.5)"
  const spreadMatch = market.question.match(/^(?:(\S+)\s+)?Spread:\s*.+?\s*\(([+-]?\d+(?:\.\d+)?)\)$/i);
  if (spreadMatch) {
    const [, prefix, spread] = spreadMatch;
    const context = prefix ? ` (${prefix})` : '';
    const transformed = `${outcomes[0]} covers ${spread} spread vs ${outcomes[1]}?${context}`;
    console.log(`[Transform Spread] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // Detect handicap markets: "Map Handicap: Team (-X.5)", "Game Handicap: Team (-X.5)", or "Handicap: Team (-X.5)"
  const handicapMatch = market.question.match(/^(?:(\S+)\s+)?(?:Map\s+|Game\s+)?Handicap:\s*.+?\s*\(([+-]?\d+(?:\.\d+)?)\)$/i);
  if (handicapMatch) {
    const [, prefix, handicap] = handicapMatch;
    // Extract handicap type (Map/Game) from original question for context
    const handicapTypeMatch = market.question.match(/^(?:(\S+)\s+)?(Map|Game)\s+Handicap:/i);
    const handicapType = handicapTypeMatch ? handicapTypeMatch[2].toLowerCase() : '';
    const contextParts: string[] = [];
    if (prefix) contextParts.push(prefix);
    if (handicapType) contextParts.push(handicapType);
    const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
    const transformed = `${outcomes[0]} covers ${handicap} handicap vs ${outcomes[1]}?${context}`;
    console.log(`[Transform Handicap] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // Detect "Series [Team] [Type] Handicap ([+-]X.X)" pattern
  // e.g., "Series Natus Vincere Rounds Handicap (-10.5)" -> "Will Natus Vincere cover the -10.5 rounds handicap vs [opponent]?"
  // e.g., "Series Team Maps Handicap (-2.5)" -> "Will Team cover the -2.5 maps handicap vs [opponent]?"
  const seriesHandicapMatch = market.question.match(/^Series\s+(.+?)\s+(\w+)\s+Handicap\s+\(([+-]?\d+(?:\.\d+)?)\)$/i);
  if (seriesHandicapMatch) {
    const [, team, handicapType, handicap] = seriesHandicapMatch;
    const transformed = `Will ${team} cover the ${handicap} ${handicapType.toLowerCase()} handicap vs ${outcomes[1]}?`;
    console.log(`[Transform Series Handicap] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // Detect "Most X?" questions: "Series: Most inhibitors?" or "Most kills?"
  const mostMatch = market.question.match(/^(?:Series:\s+)?Most\s+(\w+)\?$/i);
  if (mostMatch) {
    const [, metric] = mostMatch;
    const transformed = `${outcomes[0]} gets most ${metric}?`;
    console.log(`[Transform Most] "${market.question}" -> "${transformed}"`);
    return transformed;
  }

  // Detect "X vs. Y" pattern with optional prefix and suffix
  // Patterns supported:
  //   "Prefix: Team1 vs Team2 (Suffix)" - e.g., "LoL: GnG vs FN (BO3)"
  //   "Prefix: Team1 vs Team2 - Suffix" - e.g., "CS: Aurora vs HOTU - Map 1 Winner"
  //   "Team1 vs Team2: Suffix" - e.g., "Suns vs Heat: 1H Moneyline"
  //   "Team1 vs Team2 (Suffix)" - e.g., "Team1 vs Team2 (W)"
  const vsMatch = market.question.match(
    /^(?:(.+?):\s+)?(.+?)\s+vs\.?\s+(.+?)(?::\s+(.+?))?(?:\s+-\s+(.+?))?(?:\s+\((.+?)\))?$/i
  );
  if (!vsMatch) return market.question;

  const [, prefix, , , colonSuffix, dashSuffix, parenSuffix] = vsMatch;

  // Build context string from prefix and suffixes
  const contextParts: string[] = [];
  if (prefix) contextParts.push(prefix);
  if (parenSuffix) contextParts.push(parenSuffix);
  if (dashSuffix) contextParts.push(dashSuffix);
  if (colonSuffix) contextParts.push(colonSuffix);

  const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';

  // Log transformation for debugging
  const transformed = `${outcomes[0]} beats ${outcomes[1]}?${context}`;
  console.log(`[Transform] "${market.question}" -> "${transformed}"`);

  // Rephrase: first outcome (Yes) beats second outcome (No)
  return transformed;
}
