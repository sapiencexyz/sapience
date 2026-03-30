/**
 * LLM prompt templates for market enrichment
 */

import type { SapienceCategorySlug } from '../types';
import type { MarketEnrichmentInput, EndTimeEnrichmentInput } from './types';

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

export const ENDTIME_SYSTEM_PROMPT =
  'You are a prediction market deadline analyst with web search. Each market is a YES/NO question — you do not need to know the answer, only WHEN the answer will become available. First check if the event has ALREADY HAPPENED by searching for results — if it has, return the past date when the outcome became known. Only search for future scheduled times if the event has not occurred yet. Always output UTC. Respond only with CSV lines: id,ISO8601_datetime_UTC. No markdown, no headers. NEVER shorten or truncate IDs. If you cannot determine a resolution date, respond with id,UNKNOWN.';

/**
 * Build prompt for endTime determination via web search
 */
export function buildEndTimePrompt(markets: EndTimeEnrichmentInput[]): string {
  const marketsJson = markets.map((m) => ({
    id: m.conditionId,
    q: m.question,
    desc: m.description,
    event: m.eventTitle,
  }));

  return `Determine when the outcome of each prediction market will be definitively known.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

IMPORTANT CONTEXT: These are prediction markets with YES/NO outcomes. You do NOT need to predict the answer — you only need to determine WHEN the answer will become available. For example, "Will X be the next PM of Y?" does not require knowing who will be PM — it requires knowing when the PM will be announced (e.g. after coalition talks conclude). Similarly, "Will X happen between March 17-23?" just needs the end of that date range, not whether X actually happened.

STEP 1 — CHECK DATES IN THE QUESTION: If the question contains a date or date range, check whether it is before today (${new Date().toISOString().split('T')[0]}).
- If the date/range is entirely in the past (e.g. "between March 17-23" and today is March 27): the outcome is ALREADY knowable. Return the end of that date range (e.g. March 23 end-of-day in the relevant timezone). Do NOT add extra days for "data reporting" — prediction markets resolve based on the stated date.
- If the date is in the future: proceed to Step 2.

STEP 2 — CHECK IF THE EVENT ALREADY HAPPENED: Search for whether the event has already occurred or results are already known.
- Elections: search "[election name] [year] results" — if results exist, the outcome is ALREADY known.
- Sports: search "[team1] vs [team2] [date] score" — if a final score exists, it already happened.
- "Will X be the next [leader] after the [year] elections?": search for "[year] [country] election results" — if the election happened, the answer is known (or will be known once coalition talks conclude — estimate that date, do NOT return UNKNOWN).
- Any event: search "[event] results" or "[event] outcome" first.
If the event already happened and the outcome is known, return the date/time when the outcome became known (e.g. when results were announced, when the game ended, when the vote was counted). Do NOT return a future date for an event that already occurred.

STEP 3 — SEARCH FOR SCHEDULED TIME (only if the event has NOT happened yet): Construct a targeted search query from the question text to find the exact scheduled time. Examples:
- Sports: search "[team1] vs [team2] [date] start time"
- Esports: search "[team1] vs [team2] [tournament] schedule"
- Financial: search "[company] earnings date Q[N] [year]" or "Fed meeting [month] [year] announcement time"
- If description says the event was "postponed" or "rescheduled to [new date]": search for the new date; if not found, use the date directly
- If description contains a resolution source URL (e.g. vlr.gg, hltv.org, flashscore.com): search that site directly for the match schedule
- Elections without a specific date in the question: search "[country/region] [year] election date" to find the actual scheduled date

STEP 4 — COMPUTE END TIME: Return when the outcome will be KNOWN, not the start time.
- If the question contains a past date/range (from Step 1): return end of that date/range
- If the event already happened (from Step 2): return the date it happened (end of that day in local TZ if exact time unknown)
- Sports regular season: start time + typical duration (NBA +3h, soccer +2.5h, NFL +3.5h, MLB +4h, NHL +3h, boxing/MMA +5h, esports +4h, cricket +8h)
- Sports knockout/playoff games: add 1h extra for overtime (NBA +4h, soccer +3.5h, NFL +4.5h)
- Multi-day events (golf, cricket series, cycling): end of the final scheduled day in local timezone
- Financial data releases (earnings, GDP, CPI, PMI, jobs report): if description says "released on [DATE]" or "expected on [DATE]", use that date; use 13:30 UTC for US pre-market releases (CPI, NFP, GDP) or 20:00 UTC for after-market earnings unless a specific time is known
- Other financial events (Fed decisions): use the announcement date/time directly
- Weather markets: local midnight of the stated date in the city's timezone
- Elections (not yet held): estimated results-known time (typically several hours after polls close, or next morning for close races)
- Elections with runoffs: if the question asks about the overall winner (not a specific round), use the runoff date
- Elections already held but leader not yet chosen (e.g. coalition talks): estimate when the new government will be formed — search for "[country] coalition talks timeline" and give a realistic near-term estimate, NOT a constitutional maximum deadline
- If there is a deadline in the question/description (e.g. "Will X happen by Y?"): use Y directly

STEP 5 — FALLBACK: Only if start time cannot be found after searching, use end of day (23:59:59) in the event's local timezone. NEVER return UNKNOWN just because a specific time is missing — if the date is known, end-of-day is always an acceptable fallback.

CRITICAL: The returned date must be the EARLIEST time the outcome can be known. Never return a "must be held by" constitutional deadline when the actual event date is known. Never return a future date for an event that search results confirm has already happened.

OTHER RULES:
- Always output UTC (convert from local timezone)
- Use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
- NEVER return UNKNOWN for a market that references a specific event (election, game, release date) — always estimate when the outcome will be known, even if the exact time is uncertain. Use UNKNOWN ONLY for truly open-ended questions with no event anchor (e.g. "Will X ever happen?" with no deadline and no referenced event).

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

MARKETS:
${JSON.stringify(marketsJson, null, 2)}

Respond with CSV format only (no header, no markdown):
<full_id>,<ISO8601_datetime_UTC_or_UNKNOWN>`;
}
