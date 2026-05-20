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
- PERSON NAMES: When the subject is a person (candidate, politician, athlete, nominee, etc.), ALWAYS use their full "First Last" name if both appear anywhere in the question, description, event title, or outcomes. NEVER use a first name alone ("Xavier wins", "Kamala wins"). Last-name-only is acceptable ONLY for globally recognizable figures where the last name is unambiguous (Trump, Biden, Putin, Musk, Macron, Modi). If unsure, default to first+last.

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: KT wins Thailand
- BAD: "SDP vs LDP" for "Will SDP win most seats in Japan?" -> GOOD: SDP wins Japan
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: Chelsea wins
- BAD: "NE vs SEA" for coin toss question -> GOOD: Coin toss NE
- BAD: "G2 win" for "Will G2 win Map 2?" -> GOOD: G2 win vs MOUZ (Map 2)
- BAD: "Chelsea > ATL" for "Chelsea scores more than Atletico in the second half" -> GOOD: Chelsea > ATL (2H)
- BAD: "Elon 50+ Feb 8" for "Elon tweets 50+ times from Feb 8 to Feb 14?" -> GOOD: Elon 50+ Feb 8 - Feb 14
- BAD: "Xavier wins CA 2026" for "Will Xavier Becerra win the 2026 California Governor election?" -> GOOD: Xavier Becerra wins CA 2026
- BAD: "Kamala wins CA 2026" for "Will Kamala Harris win the 2026 California Governor election?" -> GOOD: Kamala Harris wins CA 2026
- BAD: "Chad wins CA 2026" for a market about Chad Bianco -> GOOD: Chad Bianco wins CA 2026

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

7. Candidate / person wins (elections, nominations, awards, appointments):
   - Use the candidate's full "First Last" name. First-name-only is NEVER acceptable.
   - Elections: "Will Xavier Becerra win CA Governor 2026?" -> Xavier Becerra wins CA 2026
   - Primaries / nominations: "Will JD Vance be the 2028 Republican nominee?" -> JD Vance 2028 GOP
   - Papal conclave: "Will Pietro Parolin be the next Pope?" -> Pietro Parolin next Pope
   - Nobel / prizes: "Will Yulia Navalnaya win the Nobel Peace Prize 2026?" -> Yulia Navalnaya Nobel Peace 2026
   - Oscars / cultural awards: "Will Cillian Murphy win Best Actor 2026?" -> Cillian Murphy Best Actor 2026
   - Time Person of the Year: "Will Taylor Swift be Time POTY 2026?" -> Taylor Swift Time POTY 2026
   - Corporate appointments: "Will Lisa Su be the next Intel CEO?" -> Lisa Su next Intel CEO
   - Globally recognizable figures may use last name only: "Trump wins 2024?" -> Trump 2024

8. Other markets:
   - "Fed rate cut January?" -> Fed cut Jan
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
- PERSON NAMES: When the subject is a person (candidate, politician, athlete, nominee, etc.), ALWAYS use their full "First Last" name if both appear anywhere in the question, description, event title, or outcomes. NEVER use a first name alone ("Xavier wins", "Kamala wins"). Last-name-only is acceptable ONLY for globally recognizable figures where the last name is unambiguous (Trump, Biden, Putin, Musk, Macron, Modi). If unsure, default to first+last.

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: KT wins Thailand
- BAD: "SDP vs LDP" for "Will SDP win most seats in Japan?" -> GOOD: SDP wins Japan
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: Chelsea wins
- BAD: "NE vs SEA" for coin toss question -> GOOD: Coin toss NE
- BAD: "G2 win" for "Will G2 win Map 2?" -> GOOD: G2 win vs MOUZ (Map 2)
- BAD: "Chelsea > ATL" for "Chelsea scores more than Atletico in the second half" -> GOOD: Chelsea > ATL (2H)
- BAD: "Elon 50+ Feb 8" for "Elon tweets 50+ times from Feb 8 to Feb 14?" -> GOOD: Elon 50+ Feb 8 - Feb 14
- BAD: "Xavier wins CA 2026" for "Will Xavier Becerra win the 2026 California Governor election?" -> GOOD: Xavier Becerra wins CA 2026
- BAD: "Kamala wins CA 2026" for "Will Kamala Harris win the 2026 California Governor election?" -> GOOD: Kamala Harris wins CA 2026
- BAD: "Chad wins CA 2026" for a market about Chad Bianco -> GOOD: Chad Bianco wins CA 2026

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

13. Candidate / person wins (elections, nominations, awards, appointments):
    - Use the candidate's full "First Last" name. First-name-only is NEVER acceptable.
    - Elections: "Will Xavier Becerra win CA Governor 2026?" -> Xavier Becerra wins CA 2026
    - Primaries / nominations: "Will JD Vance be the 2028 Republican nominee?" -> JD Vance 2028 GOP
    - Papal conclave: "Will Pietro Parolin be the next Pope?" -> Pietro Parolin next Pope
    - Nobel / prizes: "Will Yulia Navalnaya win the Nobel Peace Prize 2026?" -> Yulia Navalnaya Nobel Peace 2026
    - Oscars / cultural awards: "Will Cillian Murphy win Best Actor 2026?" -> Cillian Murphy Best Actor 2026
    - Time Person of the Year: "Will Taylor Swift be Time POTY 2026?" -> Taylor Swift Time POTY 2026
    - Corporate appointments: "Will Lisa Su be the next Intel CEO?" -> Lisa Su next Intel CEO
    - Globally recognizable figures may use last name only: "Trump wins 2024?" -> Trump 2024

14. Other markets:
    - "Fed rate cut January?" -> Fed cut Jan
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
  'You are an event-scheduling researcher with web search. For each input you receive a YES/NO question that references a real-world event (sports match, election, game, financial release, etc.). Your job is to find WHEN that event resolves, not WHETHER the YES outcome happens. CRITICAL: Your search queries must target the EVENT itself ("2025-26 UEFA Europa Conference League final date", "Slovenia 2026 parliamentary election date", "Lakers vs Celtics April 14 start time"). NEVER search for "prediction market resolution", "how polymarket works", "UMA dispute", or similar meta-topics — if your citations all point to predictionnews.com / cultivatelabs.com / polymarket.com/help / uma.xyz / predictpedia.com / generic prediction-market explainer pages, you have failed and must redo the search with the event name as the focus. First check if the event has ALREADY HAPPENED by searching for results — if it has, return the past date when the outcome became known. Only search for future scheduled times if the event has not occurred yet. WARNING: descriptions often contain "cancelled / not completed by [DATE] → resolves Other" backstop dates. Those are NOT the event date — find the actual scheduled final / championship / announcement date and use THAT. "BY [DATE]" DEADLINES: "by May 31" means "at any point through the END of May 31", NOT "by the start of May 31". For a US-context deadline of May 31, 2026, return 2026-06-01T03:59:59Z (= EOD May 31 ET), not 2026-05-31T03:59:59Z (which is EOD May 30 ET, one day too early). Always output UTC. Respond ONLY with a JSON array, no markdown, no prose, no explanation outside the JSON. Each entry: {"id": "<full hex id>", "ts": "<ISO8601 UTC>" or null, "confidence": "high" | "low" | "unknown"}. Confidence is source-agnostic — about what YOU know, not where you learned it. Use "high" when you have a specific clock time (date + hours + minutes), regardless of whether it came from the text or from web search. Use "low" with ts set to end-of-day 23:59:59 UTC when you only have a date. Use "unknown" with ts=null only when no date can be determined at all. NEVER shorten or truncate IDs.';

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

  const todayIso = new Date().toISOString().split('T')[0];
  // Lead with the events themselves, not with instructions or today's
  // date. Previous prompts started with "TODAY'S DATE: 2026-05-19" and
  // Sonar anchored its web search on that date string + the word
  // "schedule", returning citations for wincalendar.com, NFL schedules,
  // university calendars, etc. — none about the actual event. Putting
  // the events first forces Sonar to read team names / league names /
  // candidate names BEFORE deciding what to search for.
  return `EVENTS TO RESEARCH:
${JSON.stringify(marketsJson, null, 2)}

TASK: For each event above, web-search for WHEN its outcome will be publicly known. Return ISO 8601 UTC.

BUILD YOUR SEARCH QUERIES FROM THE EVENT TEXT — the team names, league names, election names, candidate names, dates, asset names that appear in q / event / desc. Examples of GOOD search queries:
  - "2025-26 UEFA Europa Conference League final date kickoff time"
  - "Rayo Vallecano UEFA Conference League final 2026"
  - "Slovenia 2026 parliamentary election date"
  - "Lakers vs Celtics April 14 2026 start time"
  - "Fed FOMC March 2026 meeting announcement time"

DO NOT search for any of these — they will not find the answer:
  - "how prediction markets resolve" / "polymarket resolution rules"
  - "UMA dispute" / "prediction market deadline"
  - "what events are on ${todayIso}" / generic "events calendar"
  - "football schedule" / "sports fixtures" without the league name
  - "match resolution outcome" / "prediction market explainer"

Self-check: if your post-search citations all point to polymarket.com/help, uma.xyz, cultivatelabs.com, predictionnews.com, predictpedia.com, wincalendar.com, university .edu calendars, NFL.com (when nothing is NFL), or generic explainer pages — YOU DID NOT SEARCH FOR THE EVENT. Redo the search using the team / league / candidate / asset name from q.

TODAY'S DATE: ${todayIso} (use only to decide past-vs-future; never type this date into a search query)

CONTEXT (don't let this pollute your searches): These are YES/NO questions about real-world events. You don't predict the answer — only find WHEN the answer will be known.

OPTIMISTIC RESOLUTION PRINCIPLE: Most events resolve on their scheduled / announced date. Default to that date. Only deviate when there is positive evidence of postponement, cancellation, or unusual delay (an explicit news article, a "rescheduled to" note in the description, etc.). Do NOT pad scheduled dates with speculative buffers in case of "what if it slips" — return the actual scheduled resolution time. Fallback dates (constitutional deadlines, end-of-quarter, etc.) are a last resort, not a hedge.

⚠️ CANCELLATION / "OTHER" BACKSTOP DATES ARE NOT THE EVENT DATE.
Prediction-market descriptions often contain a backstop date for the "Other" / cancellation case, e.g.:
  - "If the tournament is cancelled or not completed by October 1, 2026, this market resolves to Other."
  - "If no winner is declared by June 30, 2026, this market resolves to Other."
  - "Postponed after June 31, 2026, 11:59 PM ET, otherwise Other."
These dates are SAFETY BACKSTOPS, NOT the resolution date. The resolution date is when the event itself concludes — search for the final / championship / announcement date and use THAT.
Example:
  - BAD: market is "Will Arsenal win the 2025–26 UEFA Champions League?", description has "not completed by October 1, 2026 → Other" → return 2026-10-01.
  - GOOD: same market → search "2025-26 Champions League final date" → final is on 2026-05-30 in Budapest → return 2026-05-30T23:59:59Z (or the kickoff + 3.5h if you can find it).
If you ONLY have the backstop date and cannot find the actual event date via search, you may use the backstop — but always exhaust search first.

STEP 1 — CHECK DATES IN THE QUESTION: If the question contains a date or date range, check whether it is before today (${new Date().toISOString().split('T')[0]}).
- If the date/range is entirely in the past (e.g. "between March 17-23" and today is March 27): the outcome is ALREADY knowable. Return the end of that date range (e.g. March 23 end-of-day in the relevant timezone). Do NOT add extra days for "data reporting" — prediction markets resolve based on the stated date.
- If the date is in the future: proceed to Step 2.

STEP 2 — CHECK IF THE EVENT ALREADY HAPPENED: Search for whether the event has already occurred or results are already known.
- Elections: search "[election name] [year] results" — if results exist, the outcome is ALREADY known.
- Sports: search "[team1] vs [team2] [date] score" — if a final score exists, it already happened.
- "Will X be the next [leader] after the [year] elections?": search for "[year] [country] election results" — if the election happened, the answer is known (or will be known once coalition talks conclude — estimate that date, do NOT return UNKNOWN).
- Any event: search "[event] results" or "[event] outcome" first.
If the event already happened and the outcome is known, return the date/time when the outcome became known (e.g. when results were announced, when the game ended, when the vote was counted). Do NOT return a future date for an event that already occurred.

STEP 3 — SEARCH FOR SCHEDULED TIME (only if the event has NOT happened yet): Construct a targeted search query from the question text to find the exact scheduled time. Exhaust search BEFORE falling back — a discoverable scheduled date always beats a generic deadline. Examples:
- Sports: search "[team1] vs [team2] [date] start time"
- Esports: search "[team1] vs [team2] [tournament] schedule"
- Financial: search "[company] earnings date Q[N] [year]" or "Fed meeting [month] [year] announcement time"
- If description says the event was "postponed" or "rescheduled to [new date]": search for the new date; if not found, use the date directly
- If description contains a resolution source URL (e.g. vlr.gg, hltv.org, flashscore.com): search that site directly for the match schedule
- Elections without a specific date in the question: search "[country/region] [year] election date" to find the actual scheduled date

When you find a scheduled date, trust it. Do not silently substitute a more conservative date "in case the event slips" — the OPTIMISTIC RESOLUTION PRINCIPLE applies.

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

⏰ "BY [DATE]" DEADLINE RULE — READ CAREFULLY.
"By DATE" / "by the end of DATE" / "before DATE expires" means the deadline is the END OF the named day, not its start. The market is asking whether the event happens AT ANY TIME DURING the day named in the deadline (inclusive). You must return END-OF-DAY of that date, not the start.

Concretely: if the deadline is "May 31" and the relevant timezone is US Eastern (UTC-4 EDT in May):
  - END of May 31 in ET = midnight May 31 → June 1 ET = 2026-06-01T03:59:59Z
  - NOT 2026-05-31T03:59:59Z (which is the end of May 30 ET, one day too early).
The general formula: take the local date END (23:59:59 in local tz of the question's audience) and convert to UTC.

Examples (assume "by May 31, 2026", ET context):
  - GOOD: "Will Japan send warships through Hormuz by May 31?" → 2026-06-01T03:59:59Z
  - GOOD: "Will Donald Trump publicly insult Keir Starmer by May 31, 2026?" → 2026-06-01T03:59:59Z
  - GOOD: "Will JD Vance have a meeting with Iran by May 31, 2026?" → 2026-06-01T03:59:59Z
  - BAD: any of the above returning 2026-05-31T03:59:59Z (that's EOD May 30 ET; the deadline isn't until end of May 31).

If the question gives no timezone hint, default to UTC end-of-day: 2026-05-31T23:59:59Z.

If the deadline is "by Y" and Y is a year/month-end with no day (e.g. "by Q2 2026", "by end of 2026"): use the end of the named period in UTC.

STEP 5 — FALLBACK (last resort, after exhausting search):
- If you found the date but not the exact time: use end of day (23:59:59) in the event's local timezone. This is an acceptable fallback for the *time*, not for the *date*.
- If you cannot find any scheduled date AND no deadline is stated in the question: only then may you fall back to a constitutional / end-of-period deadline. Make this the genuine outer bound — not a "safe" guess when an actual date probably exists but you didn't search hard enough.
- NEVER return UNKNOWN just because a specific time is missing — if the date is known, end-of-day is always an acceptable fallback.

CRITICAL: The returned date must be the EARLIEST time the outcome can be known. Never return a "must be held by" constitutional deadline when the actual event date is known. Never return a future date for an event that search results confirm has already happened. Default to optimism — assume the scheduled date holds unless evidence says otherwise.

OTHER RULES:
- Always output UTC (convert from local timezone)
- Use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
- NEVER return UNKNOWN for a market that references a specific event (election, game, release date) — always estimate when the outcome will be known, even if the exact time is uncertain. Use UNKNOWN ONLY for truly open-ended questions with no event anchor (e.g. "Will X ever happen?" with no deadline and no referenced event).

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

OUTPUT FORMAT — respond with a single JSON array, no markdown fences, no prose:
[
  { "id": "<full hex id>", "ts": "<ISO8601 UTC>" or null, "confidence": "high" | "low" | "unknown" }
]

CONFIDENCE RULES (about what YOU know, not where the info came from):
- "high": you have a specific clock time for the resolution (hours + minutes), whether it came from the text OR from your web search. Examples:
    - Title says "May 16 at 12:00 PM ET" → high
    - Description says "noon ET" → high
    - Web search confirmed "the final kicks off May 30 21:00 CET" → high (the time is real, the source doesn't matter)
- "low": you only have a date (or a multi-day event with no narrower window); set ts to end-of-day 23:59:59 UTC of the resolution day.
- "unknown": you cannot determine any date at all; set ts to null.`;
}
