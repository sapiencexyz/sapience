/**
 * LLM prompt templates for market enrichment
 */

import type { SapienceCategorySlug } from '../types';
import type { MarketEnrichmentInput } from './types';

export const VALID_CATEGORIES: SapienceCategorySlug[] = [
  'crypto',
  'weather',
  'tech-science',
  'economy-finance',
  'geopolitics',
  'sports',
  'culture',
];

/**
 * Build prompt for category-only enrichment (when short name is already determined)
 */
export function buildCategoryPrompt(markets: MarketEnrichmentInput[]): string {
  const marketsJson = markets.map((m) => ({
    id: m.conditionId,
    q: m.question,
    desc: m.description?.slice(0, 300),
    event: m.eventTitle,
  }));

  return `Categorize these prediction markets.

CATEGORIES: ${VALID_CATEGORIES.join(', ')}

CATEGORY NOTES:
- Tweet/social media markets (e.g., "Will Elon tweet about X?") → culture

MARKETS:
${JSON.stringify(marketsJson, null, 2)}

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

Respond with CSV format only (no header, no markdown):
<full_id>,<category>`;
}

/**
 * Build prompt for short-name-only enrichment (when category is already determined)
 */
export function buildShortNameOnlyPrompt(
  markets: MarketEnrichmentInput[]
): string {
  const marketsJson = markets.map((m) => ({
    id: m.conditionId,
    q: m.question,
    desc: m.description?.slice(0, 300),
    event: m.eventTitle,
    outcomes: m.outcomes,
  }));

  return `Generate short names for these prediction markets.

UNDERSTANDING OUTCOMES:
- "outcomes" array = [YesSide, NoSide]
- outcomes[0] = what happens if market resolves YES (e.g., the winning team)
- outcomes[1] = the opposing side
- When outcomes are team names (not "Yes"/"No"), use outcomes[0] as the winner

RULES for "name" (shortName):
- MUST be answerable as Yes/No (MOST IMPORTANT - clarity over brevity!)
- NEVER use "vs" format for non-matchup questions - use "X wins" instead
- Should be under 20 characters when possible
- Use abbreviations: O/U, pts, reb, ast
- Team abbreviations when well-known: LAL, BOS, NYK, CHI, MIA, GSW, etc.
- NEVER wrap the short name in quotes - output plain text only
- Censor explicit/profane words with *** (e.g., "f***", "s***"), don't change for something that isn't profane
- When a market has a specific date or deadline, ALWAYS include it in the short name (e.g., "BTC >$100k Feb 14" not "BTC >$100k")
- For date ranges ("from X to Y"), include BOTH dates: "Elon 50+ Feb 8 - Feb 14" not "Elon 50+ Feb 8"
- Always put a SPACE between month abbreviation and day number: "Feb 8" not "Feb8", "Jan 14" not "Jan14"
- If the condition refers to a specific part of the match (map, half, quarter, set, etc.), ALWAYS include it in the short name in parentheses

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: KT wins Thailand
- BAD: "SDP vs LDP" for "Will SDP win most seats in Japan?" -> GOOD: SDP wins Japan
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: Chelsea wins
- BAD: "NE vs SEA" for coin toss question -> GOOD: Coin toss NE
- BAD: "G2 win" for "Will G2 win Map 2?" -> GOOD: G2 win vs MOUZ (Map 2)
- BAD: "Chelsea > ATL" for "Chelsea scores more than Atletico in the second half" -> GOOD: Chelsea > ATL (2H)
- BAD: "Elon 50+ Feb 8" for "Elon tweets 50+ times from Feb 8 to Feb 14?" -> GOOD: Elon 50+ Feb 8 - Feb 14

MARKET TYPE FORMATS:

1. Team matchups (ONLY use "vs" when it's actually a head-to-head game):
   q: "Lakers vs Celtics", outcomes: ["Lakers","Celtics"] -> LAL wins
   If about a specific segment: G2 win vs MOUZ (Map 2), Chelsea > ATL (2H)

2. Single team/party win questions (NOT a matchup - use "wins"):
   - "Will Chelsea FC win?" -> Chelsea wins
   - "Will LDP win majority in Japan?" -> LDP wins Japan
   - "Will KT Party win most seats?" -> KT wins Thailand

3. Over/Under totals ("X vs Y: O/U 244.5"):
   -> LAL/BOS O244.5
   -> AUR/FUR O244.5
   For maps O/U: G2 vs MOUZ O2.5 maps

4. Player props ("Player: Points Over 25.5"):
   -> LeBron O25.5pts

5. Spread markets ("Spread: Team (-3.5)"):
   -> Lakers -3.5

6. Price movement ("Asset Up or Down on Date"):
   -> SOL up Jan 14

7. Other markets:
   - "Fed rate cut January?" -> Fed cut Jan
   - "Trump wins 2024?" -> Trump 2024
   - "Bitcoin above $100k by Feb 14?" -> BTC >$100k Feb 14

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

MARKETS:
${JSON.stringify(marketsJson, null, 2)}

Respond with CSV format only (no header, no markdown):
<full_id>,<shortName>`;
}

/**
 * Build prompt for full enrichment (category + short name)
 */
export function buildBothPrompt(markets: MarketEnrichmentInput[]): string {
  const marketsJson = markets.map((m) => ({
    id: m.conditionId,
    q: m.question,
    desc: m.description?.slice(0, 300),
    event: m.eventTitle,
    outcomes: m.outcomes,
  }));

  return `Categorize prediction markets and generate short names.

CATEGORIES: ${VALID_CATEGORIES.join(', ')}

CATEGORY NOTES:
- Tweet/social media markets (e.g., "Will Elon tweet about X?") → culture

UNDERSTANDING OUTCOMES:
- "outcomes" array = [YesSide, NoSide]
- outcomes[0] = what happens if market resolves YES (e.g., the winning team)
- outcomes[1] = the opposing side
- When outcomes are team names (not "Yes"/"No"), use outcomes[0] as the winner

RULES for "name" (shortName):
- MUST be answerable as Yes/No (MOST IMPORTANT - clarity over brevity!)
- NEVER use "vs" format for non-matchup questions - use "X wins" instead
- Should be under 20 characters when possible
- Use abbreviations: O/U, pts, reb, ast
- Team abbreviations when well-known: LAL, BOS, NYK, CHI, MIA, GSW, etc.
- NEVER wrap the short name in quotes - output plain text only
- Censor explicit/profane words with *** (e.g., "f***", "s***")
- When a market has a specific date or deadline, ALWAYS include it in the short name (e.g., "BTC >$100k Feb 14" not "BTC >$100k")
- For date ranges ("from X to Y"), include BOTH dates: "Elon 50+ Feb 8 - Feb 14" not "Elon 50+ Feb 8"
- Always put a SPACE between month abbreviation and day number: "Feb 8" not "Feb8", "Jan 14" not "Jan14"
- If the condition refers to a specific part of the match (map, half, quarter, set, etc.), ALWAYS include it in the short name in parentheses

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: KT wins Thailand
- BAD: "SDP vs LDP" for "Will SDP win most seats in Japan?" -> GOOD: SDP wins Japan
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: Chelsea wins
- BAD: "NE vs SEA" for coin toss question -> GOOD: Coin toss NE
- BAD: "G2 win" for "Will G2 win Map 2?" -> GOOD: G2 win vs MOUZ (Map 2)
- BAD: "Chelsea > ATL" for "Chelsea scores more than Atletico in the second half" -> GOOD: Chelsea > ATL (2H)
- BAD: "Elon 50+ Feb 8" for "Elon tweets 50+ times from Feb 8 to Feb 14?" -> GOOD: Elon 50+ Feb 8 - Feb 14

MARKET TYPE FORMATS:

1. Team matchups (ONLY use "vs" when it's actually a head-to-head game):
   q: "Lakers vs Celtics", outcomes: ["Lakers","Celtics"] -> LAL wins
   If about a specific segment: G2 win vs MOUZ (Map 2), Chelsea > ATL (2H)

2. Single team/party win questions (NOT a matchup - use "wins"):
   - "Will Chelsea FC win?" -> Chelsea wins
   - "Will LDP win majority in Japan?" -> LDP wins Japan
   - "Will KT Party win most seats?" -> KT wins Thailand
   - "Will Seahawks win Super Bowl?" -> Seahawks SB win

3. Over/Under totals ("X vs Y: O/U 244.5" or "X vs Y: 1H O/U 120"):
   -> LAL/BOS O244.5 or LAL/BOS 1H O120
   For maps O/U: G2 vs MOUZ O2.5 maps

4. Player props ("Player: Points Over 25.5"):
   -> LeBron O25.5pts
   -> Curry O6.5 3pts
   -> Jokic O10.5reb

5. Spread markets ("Spread: Team (-3.5)" or "1H Spread: Team (-2.5)"):
   outcomes: ["Lakers","Celtics"] -> Lakers -3.5 or LAL -2.5 1H

6. Handicap markets ("Map Handicap: Team (-1.5)"):
   outcomes: ["Vitality","NaVi"] -> Vitality -1.5

7. eSports maps ("Team to win 1 maps?"):
   -> Vitality 1+ maps

8. Both Teams Score ("X vs Y: Both Teams to Score"):
   -> BTTS LAL/BOS

9. Price movement ("Asset Up or Down on Date"):
   -> SOL up Jan 14 or SPX up Feb 5

10. Most X ("Series: Most kills?"):
    outcomes: ["TeamA","TeamB"] -> TeamA most kills

11. Elon Musk tweets:
    - "Will Elon tweet about Doge?" -> Elon tweets Doge
    - "Elon tweets 50+ times Jan 20?" -> Elon 50+ Jan 20
    - "Elon tweets 50+ times from Feb 8 to Feb 14?" -> Elon 50+ Feb 8 - Feb 14
    - "Will Elon Musk post on X about Bitcoin?" -> Elon tweets BTC
    - "Elon tweets 100+ times this week?" -> Elon 100+ tweets
    - "Will Elon Musk post 200-219 tweets?" -> Elon 200-219 tweets

12. Awards/MVP:
    - "Will Kupp win Super Bowl MVP?" -> Kupp SB MVP
    - "Will Henderson be NFL OROY?" -> Henderson OROY

13. Other markets:
    - "Fed rate cut January?" -> Fed cut Jan
    - "Trump wins 2024?" -> Trump 2024
    - "Bitcoin above $100k?" -> BTC >$100k
    - "Bitcoin above $100k by Feb 14?" -> BTC >$100k Feb 14

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

MARKETS:
${JSON.stringify(marketsJson, null, 2)}

Respond with CSV format only (no header, no markdown):
<full_id>,<category>,<shortName>`;
}

export const CATEGORY_SYSTEM_PROMPT =
  'You are a prediction market categorization assistant. Respond only with CSV lines: id,category. No markdown, no headers. NEVER shorten or truncate IDs.';

export const SHORTNAME_ONLY_SYSTEM_PROMPT =
  'You are a prediction market short name generator. Respond only with CSV lines: id,shortName. No markdown, no headers, no quotes around values. NEVER shorten or truncate IDs.';

export const BOTH_SYSTEM_PROMPT =
  'You are a prediction market categorization assistant. Respond only with CSV lines: id,category,shortName. No markdown, no headers, no quotes around values. NEVER shorten or truncate IDs.';
