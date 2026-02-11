# Polymarket Curation Process

How prediction markets from [Polymarket](https://polymarket.com) get selected and listed on [Sapience](https://sapience.xyz).

## Overview

Sapience doesn't list every market from Polymarket. Instead, an automated pipeline fetches, filters, and submits only markets that meet certain quality and relevance criteria. The goal is to surface high-signal, active markets while filtering out noise.

**At a glance, a market must:**

- End within the next **7 days**
- Be a **binary** (Yes/No) market
- Have at least **$50,000 in trading volume** and **$1,000 in liquidity** — unless it covers a key topic (see [Always-Include](#step-5-always-include-override) below)
- Not be a **crypto** market (with some exceptions)
- Not already exist on Sapience

### Steps

1. Fetch active markets from Polymarket (ending within 7 days)
2. Keep only binary (Yes/No) markets
3. Group markets by event
4. Filter by volume & liquidity thresholds
5. Always-include override for key topics
6. Exclude crypto category (with exceptions)
7. Skip markets already on Sapience
8. Enrich with short names & categories
9. Submit to Sapience

## Step 1: Fetching Markets

The keeper pulls all **active, open** markets from Polymarket that are **ending within the next 7 days**, starting with the soonest. This keeps Sapience focused on near-term, resolvable questions.

## Step 2: Binary Markets Only

Only markets with **exactly 2 outcomes** are kept (e.g. "Yes" / "No", or two named options like "Lakers" / "Celtics"). Markets with 3 or more outcomes are discarded — Sapience's forecasting interface is built around binary questions.

## Step 3: Grouping by Event

Markets are grouped by their parent **event** on Polymarket. For example, several player-prop markets under the same NBA game would be grouped together. Markets without a parent event are treated as standalone questions.

## Step 4: Volume & Liquidity Filters

A market (or group) must pass **both** of these thresholds to be included:

| Threshold | Minimum |
|-----------|---------|
| **Trading volume** | $50,000 |
| **Liquidity** | $1,000 |

For grouped markets, the group passes if **at least one market** in it meets both thresholds.

These thresholds ensure only markets with real trading activity and sufficient depth make it through. Thinly traded or illiquid markets are excluded.

## Step 5: Always-Include Override

Some topics are important enough that their markets should **always** appear on Sapience, even if they haven't hit the volume/liquidity thresholds yet (e.g. a newly created market that hasn't had time to accumulate trades).

A market is always included if its question mentions any of these:

| Topic | What it matches | Example market |
|-------|----------------|----------------|
| **Federal Reserve** | "fed", "federal reserve" | *"Will the Fed cut rates in March?"* |
| **S&P 500** | "S&P 500", "SPX" | *"Will the S&P 500 close above 5,000?"* |
| **Daily Bitcoin price** | "price of Bitcoin... on [date]" | *"Will the price of Bitcoin be above $100,000 on March 1?"* |
| **Daily Ethereum price** | "price of Ethereum... on [date]" | *"Will the price of Ethereum be above $4,000 on March 1?"* |

These patterns are checked case-insensitively. The idea is that markets about major economic indicators and benchmark asset prices are always worth surfacing, regardless of how much trading activity they've seen so far.

## Step 6: Crypto Exclusion

Markets categorized as **crypto** are excluded by default. Polymarket has a very large number of crypto-related markets, and including all of them would overwhelm the feed with price-target questions.

**Exception:** Crypto markets that match an always-include pattern (like the daily BTC/ETH price markets above) still get through. This way, the most broadly relevant crypto markets are kept while the long tail is filtered out.

## Step 7: Skip Existing Markets

Markets that already exist on Sapience are skipped. No duplicates.

## Step 8: Enrichment (Short Names & Categories)

Each market that passes all filters is enriched with two pieces of metadata before being listed:

### Categories

Every market is assigned to one of these categories:

| Category | Examples |
|----------|----------|
| Sports | NBA, NFL, soccer, eSports |
| Crypto | Bitcoin, Ethereum, DeFi |
| Weather | Temperature, hurricanes, climate |
| Tech & Science | AI, SpaceX, NASA |
| Economy & Finance | Fed rates, S&P 500, GDP |
| Geopolitics | Elections, wars, policy |
| Culture | Oscars, tweets, entertainment |

Categories are inferred from keywords in the market question and metadata. When keywords aren't enough, an LLM classifies the market.

### Short Names

Markets get a concise display label so they're easy to scan. For example:

| Full question | Short name |
|--------------|------------|
| *"Will the price of Bitcoin be above $100,000?"* | BTC >$100k |
| *"Lakers vs. Celtics: O/U 224.5"* | LAL/BOS O224.5 |
| *"Will the Fed cut rates in January?"* | Fed cut Jan |
| *"LeBron James: Points Over 25.5"* | James O25.5pts |

Short names are generated from pattern rules first, with an LLM as a fallback for markets that don't match any pattern.

For full details on the enrichment system, see [market-enrichment.md](./market-enrichment.md).

---

Have ideas on how we should change the curation criteria? Come discuss it in our [Discord](https://discord.gg/sapience) or submit a pull request.
