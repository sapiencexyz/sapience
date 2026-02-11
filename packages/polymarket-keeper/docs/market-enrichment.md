# Market Enrichment: Short Names & Categories

This document details how the polymarket-keeper generates **short names** and **categories** for prediction markets. The system uses a hybrid approach combining deterministic pattern matching with LLM-based inference.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Processing Pipeline](#processing-pipeline)
3. [Deterministic Processing](#deterministic-processing)
   - [Category Inference](#category-inference)
   - [Short Name Inference](#short-name-inference)
4. [LLM Processing](#llm-processing)
   - [Prompts](#prompts)
   - [Response Parsing](#response-parsing)
5. [Fallback Strategy](#fallback-strategy)
6. [Configuration](#configuration)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Market Enrichment Flow                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PolymarketMarket[]                                                  │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────┐                                                │
│  │ Deterministic    │   inferShortName() → string | null             │
│  │ Pattern Matching │   inferSapienceCategorySlug() → category       │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Market Classification                     │    │
│  ├────────────────┬────────────────┬───────────────┬───────────┤    │
│  │ Fully          │ Needs Category │ Needs Short   │ Needs     │    │
│  │ Deterministic  │ Only           │ Name Only     │ Both      │    │
│  │ (no LLM)       │ (LLM category) │ (LLM name)    │ (LLM all) │    │
│  └───────┬────────┴───────┬────────┴──────┬────────┴─────┬─────┘    │
│          │                │               │              │           │
│          │                ▼               ▼              ▼           │
│          │         ┌─────────────────────────────────────────┐      │
│          │         │           OpenRouter API                 │      │
│          │         │   (gpt-4o-mini via openrouter.ai)       │      │
│          │         └─────────────────────────────────────────┘      │
│          │                          │                                │
│          ▼                          ▼                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    MarketEnrichmentOutput                     │   │
│  │         { conditionId, category, shortName }                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Files:**
- `src/llm/enrichment.ts` - Main orchestration logic
- `src/llm/prompts.ts` - LLM prompt templates
- `src/llm/openrouter.ts` - OpenRouter API client & response parsing
- `src/generate/category.ts` - Deterministic category inference
- `src/generate/shortName.ts` - Deterministic short name inference

---

## Processing Pipeline

The enrichment system processes markets in **four categories** to minimize LLM API calls:

| Category | Short Name | Category | LLM Call |
|----------|------------|----------|----------|
| Fully Deterministic | ✅ Pattern match | ✅ Keyword match | None |
| Needs Category Only | ✅ Pattern match | ❌ Unknown | Category-only prompt |
| Needs Short Name Only | ❌ No pattern | ✅ Keyword match | ShortName-only prompt |
| Needs Both | ❌ No pattern | ❌ Unknown | Full prompt |

**Example log output:**
```
[LLM] Split: 45 fully deterministic, 12 need LLM category, 8 need LLM shortName, 25 need LLM both
```

---

## Deterministic Processing

### Category Inference

**File:** `src/generate/category.ts`

Categories are inferred using **keyword matching** against:
- Market question
- Market slug
- Event series slug/title

**Valid Categories:**
```typescript
type SapienceCategorySlug =
  | 'crypto'
  | 'weather'
  | 'tech-science'
  | 'economy-finance'
  | 'geopolitics'
  | 'sports'
  | 'culture';
```

**Keyword Patterns (in priority order):**

| Category | Keywords/Patterns |
|----------|-------------------|
| `sports` | `sportsMarketType` field set, or keywords: `pga`, `nba`, `nfl`, `nhl`, `mlb`, `epl`, `premier-league`, `uefa`, `fifa`, `world-cup`, `super-bowl`, `playoff`, `championship`, `valorant`, `league-of-legends`, team names, etc. |
| `crypto` | `bitcoin`, `btc`, `ethereum`, `eth`, `solana`, `sol`, `xrp`, `crypto`, `blockchain`, `defi`, `nft`, `token`, `coin` |
| `weather` | `weather`, `temperature`, `hottest`, `coldest`, `hurricane`, `tornado`, `flood`, `drought`, `climate` |
| `tech-science` | `ai`, `artificial-intelligence`, `chatgpt`, `openai`, `tech`, `nasa`, `space`, `spacex`, `tesla`, `apple`, `google`, `microsoft` |
| `economy-finance` | `stock`, `s&p`, `spx`, `dow`, `nasdaq`, `fed`, `federal-reserve`, `interest-rate`, `inflation`, `gdp`, `economy` |
| `geopolitics` | `election`, `president`, `senate`, `congress`, `vote`, `republican`, `democrat`, `war`, `military`, `nato`, `ukraine`, `russia` |
| `culture` | `oscar`, `emmy`, `grammy`, `movie`, `music`, `celebrity`, `netflix`, `tweet`, `elon-musk`, `twitter` |

**If no keywords match:** Returns `'unknown'` → triggers LLM categorization.

---

### Short Name Inference

**File:** `src/generate/shortName.ts`

Short names are generated using **16 regex-based rules**. Returns `null` if no pattern matches.

#### Abbreviation Lookups

**Team Abbreviations (112+ teams):**
```typescript
const TEAM_ABBREVIATIONS = {
  // NBA
  Lakers: 'LAL', Celtics: 'BOS', Warriors: 'GSW', Knicks: 'NYK', ...
  // NFL
  Chiefs: 'KC', Eagles: 'PHI', Bills: 'BUF', Cowboys: 'DAL', ...
  // MLB
  Yankees: 'NYY', Dodgers: 'LAD', 'Red Sox': 'BOS', ...
  // eSports
  Vitality: 'VIT', NaVi: 'NAVI', G2: 'G2', Fnatic: 'FNC', ...
};
```

**Asset Abbreviations:**
```typescript
const ASSET_ABBREVIATIONS = {
  Bitcoin: 'BTC', Ethereum: 'ETH', Solana: 'SOL',
  'S&P 500': 'SPX', Nasdaq: 'NDX', Tesla: 'TSLA', ...
};
```

**Stat Abbreviations:**
```typescript
const STAT_ABBREVIATIONS = {
  points: 'pts', rebounds: 'reb', assists: 'ast',
  steals: 'stl', blocks: 'blk', '3-pointers': '3pts'
};
```

#### Pattern Rules

| # | Pattern | Example Input | Example Output |
|---|---------|---------------|----------------|
| 1 | Player props | `LeBron James: Points Over 25.5` | `James O25.5pts` |
| 2 | Over/Under totals | `Lakers vs. Celtics: O/U 224.5` | `LAL/BOS O224.5` |
| 3 | Spread markets | `Spread: Lakers (-3.5)` | `LAL -3.5` |
| 4 | Team matchups | `Lakers vs. Celtics` (outcomes: `["Lakers", "Celtics"]`) | `LAL win vs BOS` |
| 5 | Both Teams Score | `Man City vs. Arsenal: Both Teams to Score` | `BTTS MNC/ARS` |
| 6 | eSports maps | `Vitality to win 2 maps?` | `VIT 2+ maps` |
| 7 | Handicap | `Map Handicap: NaVi (-1.5)` | `NAVI -1.5` |
| 8 | Price movement | `Bitcoin Up or Down - January 15` | `BTC up Jan15` |
| 9 | Elon tweets (topic) | `Will Elon tweet about Dogecoin?` | `Elon tweets DOGE` |
| 10 | Elon tweets (count) | `Elon tweets 50+ times January 20?` | `Elon 50+ Jan20` |
| 11 | Fed rates | `Fed rate cut January?` | `Fed cut Jan` |
| 12 | Crypto thresholds | `Bitcoin above $100,000?` | `BTC >$100,000` |
| 13 | Price between | `Will the price of SOL be between $200 and $250?` | `SOL $200-250` |
| 14 | Price above/below | `Will the price of ETH be above $5000?` | `ETH >$5000` |
| 15 | Crypto reach/dip | `Will Bitcoin reach $150,000?` | `BTC reach $150,000` |
| 16 | Team totals | `Lakers Team Total: O/U 112.5` | `LAL Total O112.5` |
| 17 | Temperature | `Will global temperature increase by 1.5C in March?` | `Temp +1.5C Mar` |

**Unknown Team Fallback:**
If a team isn't in the lookup table, abbreviation is generated:
1. If name ≤3 chars → use as-is uppercase
2. If starts with vowel → first 3 letters uppercase
3. Otherwise → first 3 consonants uppercase
4. Fallback → first 3 letters

---

## LLM Processing

### API Configuration

**Provider:** OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)

**Default Model:** `openai/gpt-4o-mini`

**Parameters:**
```typescript
{
  temperature: 0.1,      // Low for consistency
  max_tokens: 10000,     // Large buffer for batch responses
  timeout: 30000         // 30 second timeout
}
```

**Batching:** Markets are processed in batches of **10** to avoid token limits.

---

### Prompts

The system uses three specialized prompts depending on what's needed:

#### 1. Category-Only Prompt

**System Prompt:**
```
You are a prediction market categorization assistant. Respond only with CSV lines: id,category. No markdown, no headers. NEVER shorten or truncate IDs.
```

**User Prompt Template:**
```
Categorize these prediction markets.

CATEGORIES: crypto, weather, tech-science, economy-finance, geopolitics, sports, culture

CATEGORY NOTES:
- Tweet/social media markets (e.g., "Will Elon tweet about X?") → culture

MARKETS:
[
  { "id": "0xabc123...", "q": "Will Bitcoin reach $100k?", "desc": "...", "event": "..." }
]

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

Respond with CSV format only (no header, no markdown):
<full_id>,<category>
```

---

#### 2. Short-Name-Only Prompt

**System Prompt:**
```
You are a prediction market short name generator. Respond only with CSV lines: id,shortName. No markdown, no headers. NEVER shorten or truncate IDs.
```

**User Prompt Template:**
```
Generate short names for these prediction markets.

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

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: "KT wins Thailand"
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: "Chelsea wins"

MARKET TYPE FORMATS:
1. Team matchups (ONLY use "vs" when it's actually a head-to-head game)
2. Single team/party win questions → "X wins"
3. Over/Under totals → "LAL/BOS O244.5"
4. Player props → "LeBron O25.5pts"
5. Spread markets → "Lakers -3.5"
6. Price movement → "SOL up Jan14"
... [additional format rules]

MARKETS:
[JSON array of markets with id, q, desc, event, outcomes]

Respond with CSV format only (no header, no markdown):
<full_id>,<shortName>
```

---

#### 3. Full Prompt (Category + Short Name)

Used when a market has **neither** a deterministic short name **nor** a known category.

**System Prompt:**
```
You are a prediction market categorization assistant. Respond only with CSV lines: id,category,shortName. No markdown, no headers. NEVER shorten or truncate IDs.
```

**User Prompt Template (Complete):**
```
Categorize prediction markets and generate short names.

CATEGORIES: crypto, weather, tech-science, economy-finance, geopolitics, sports, culture

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

COMMON MISTAKES TO AVOID:
- BAD: "KT vs PPLE" for "Will KT Party win most seats?" -> GOOD: "KT wins Thailand"
- BAD: "SDP vs LDP" for "Will SDP win most seats in Japan?" -> GOOD: "SDP wins Japan"
- BAD: "Chelsea vs Wav" for "Will Chelsea win?" -> GOOD: "Chelsea wins"
- BAD: "NE vs SEA" for coin toss question -> GOOD: "Coin toss NE"

MARKET TYPE FORMATS:

1. Team matchups (ONLY use "vs" when it's actually a head-to-head game):
   q: "Lakers vs Celtics", outcomes: ["Lakers","Celtics"] -> "LAL wins"

2. Single team/party win questions (NOT a matchup - use "wins"):
   - "Will Chelsea FC win?" -> "Chelsea wins"
   - "Will LDP win majority in Japan?" -> "LDP wins Japan"
   - "Will KT Party win most seats?" -> "KT wins Thailand"
   - "Will Seahawks win Super Bowl?" -> "Seahawks SB win"

3. Over/Under totals ("X vs Y: O/U 244.5" or "X vs Y: 1H O/U 120"):
   -> "LAL/BOS O244.5" or "LAL/BOS 1H O120"

4. Player props ("Player: Points Over 25.5"):
   -> "LeBron O25.5pts"
   -> "Curry O6.5 3pts"
   -> "Jokic O10.5reb"

5. Spread markets ("Spread: Team (-3.5)" or "1H Spread: Team (-2.5)"):
   outcomes: ["Lakers","Celtics"] -> "Lakers -3.5" or "LAL -2.5 1H"

6. Handicap markets ("Map Handicap: Team (-1.5)"):
   outcomes: ["Vitality","NaVi"] -> "Vitality -1.5"

7. eSports maps ("Team to win 1 maps?"):
   -> "Vitality 1+ maps"

8. Both Teams Score ("X vs Y: Both Teams to Score"):
   -> "BTTS LAL/BOS"

9. Price movement ("Asset Up or Down on Date"):
   -> "SOL up Jan14" or "SPX up Feb5"

10. Most X ("Series: Most kills?"):
    outcomes: ["TeamA","TeamB"] -> "TeamA most kills"

11. Elon Musk tweets:
    - "Will Elon tweet about Doge?" -> "Elon tweets Doge"
    - "Elon tweets 50+ times Jan 20?" -> "Elon 50+ Jan20"
    - "Will Elon Musk post on X about Bitcoin?" -> "Elon tweets BTC"
    - "Elon tweets 100+ times this week?" -> "Elon 100+ tweets"
    - "Will Elon Musk post 200-219 tweets?" -> "Elon 200-219 tweets"

12. Awards/MVP:
    - "Will Kupp win Super Bowl MVP?" -> "Kupp SB MVP"
    - "Will Henderson be NFL OROY?" -> "Henderson OROY"

13. Other markets:
    - "Fed rate cut January?" -> "Fed cut Jan"
    - "Trump wins 2024?" -> "Trump 2024"
    - "Bitcoin above $100k?" -> "BTC >$100k"

IMPORTANT: Never shorten or truncate the market ID - copy it exactly as provided.

MARKETS:
[
  {
    "id": "0x1234567890abcdef...",
    "q": "Will Bitcoin reach $100,000 by end of 2024?",
    "desc": "This market resolves YES if...",
    "event": "Bitcoin Price Predictions",
    "outcomes": ["Yes", "No"]
  }
]

Respond with CSV format only (no header, no markdown):
<full_id>,<category>,<shortName>
```

**Example Response:**
```
0x1234567890abcdef...,crypto,BTC >$100k 2024
0xabcdef1234567890...,sports,LAL wins vs BOS
0x9876543210fedcba...,culture,Elon tweets DOGE
```

---

### Response Parsing

Responses are parsed with a **three-pass strategy** to handle LLM inconsistencies:

#### Pass 1: Exact ID Matching
```typescript
const marketMap = new Map(markets.map(m => [m.conditionId, m]));
for (const line of lines) {
  const [id, ...rest] = line.split(',');
  if (marketMap.has(id)) {
    // Exact match found
  }
}
```

#### Pass 2: Fuzzy ID Matching (Levenshtein Distance)

LLMs sometimes truncate or slightly modify condition IDs. The parser uses **Levenshtein distance** to recover:

```typescript
function findClosestConditionId(id: string, validIds: string[]): string | null {
  let bestMatch = null;
  let bestDistance = 5; // Threshold

  for (const validId of validIds) {
    const distance = levenshteinDistance(id, validId);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = validId;
    }
  }
  return bestMatch;
}
```

**Threshold:** Match accepted if edit distance < 5

#### Pass 3: Fallback for Missing

Any markets not found in the LLM response get **deterministic fallback** enrichment.

---

## Fallback Strategy

When LLM is disabled or fails:

```typescript
function getFallbackEnrichment(market: PolymarketMarket): MarketEnrichmentOutput {
  const category = inferSapienceCategorySlug(market);
  return {
    conditionId: market.conditionId,
    // If deterministic category is 'unknown', fall back to 'geopolitics'
    category: category === 'unknown' ? 'geopolitics' : category,
    shortName: inferShortName(market) ?? market.question,
  };
}
```

**Fallback triggers:**
1. `LLM_ENABLED=false`
2. No `OPENROUTER_API_KEY` provided
3. API error (after 3 retries)
4. Market missing from LLM response
5. Response truncated (hit token limit)

---

## Configuration

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_ENABLED` | Enable/disable LLM enrichment | `true` |
| `OPENROUTER_API_KEY` | API key for OpenRouter | (required for LLM) |
| `LLM_MODEL` | Model to use | `openai/gpt-4o-mini` |

**Logging:**

In non-production environments, LLM requests/responses are logged to `llm-markets.log`:
```
=== 2024-01-15T10:30:00.000Z | CATEGORY REQUEST (10 markets) ===
Markets:
  - 0xabc123: Will Bitcoin reach $100k?
  - 0xdef456: Lakers vs Celtics

Response:
0xabc123,crypto
0xdef456,sports
===
```

---

## Performance Optimizations

1. **In-memory caching** - Results cached within a run to avoid re-processing
2. **Batching** - Markets processed in batches of 10
3. **Parallel classification** - Markets split by what's needed (deterministic vs LLM)
4. **Existing condition filter** - Markets already in Sapience API skip LLM entirely
5. **Specialized prompts** - Category-only/shortName-only prompts reduce token usage

---

## Adding New Patterns

### To add a deterministic short name pattern:

1. Edit `src/generate/shortName.ts`
2. Add regex pattern and transformation logic
3. Add team/asset abbreviations to lookup tables if needed

### To add a deterministic category keyword:

1. Edit `src/generate/category.ts`
2. Add keywords to the appropriate category regex

### To improve LLM prompts:

1. Edit `src/llm/prompts.ts`
2. Add examples to `COMMON MISTAKES TO AVOID` section
3. Add new `MARKET TYPE FORMATS` entries
