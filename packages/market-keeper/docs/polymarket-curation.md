# Polymarket Curation Process

How prediction markets from [Polymarket](https://polymarket.com) get selected and listed on [Sapience](https://sapience.xyz).

## Overview

Sapience doesn't list every market from Polymarket. Instead, an automated pipeline fetches, filters, and submits only markets that meet certain quality and relevance criteria. The goal is to surface high-signal, active markets while filtering out noise.

**At a glance, a market must:**

- Settle within the next **21 days**
- Be a **binary** (Yes/No) market
- Have at least **$5,000 in trading volume** and **$1,000 in liquidity** — unless it covers a key topic (see [Always-Include](#step-4-always-include-override) below)
- Not be a **crypto** market (with some exceptions)
- Not already exist on Sapience

### Steps

1. Fetch active markets from Polymarket (settling within 21 days)
2. Keep only binary (Yes/No) markets
3. Filter by volume & liquidity thresholds (with always-include override)
4. Exclude crypto category (with always-include exception)
5. Skip markets already on Sapience
6. Enrich with short names & categories
7. Submit to Sapience

## Step 1: Fetching Markets

The keeper pulls all **active, open** markets from Polymarket that are **settling within the next 21 days**, starting with the soonest. This keeps Sapience focused on near-term, resolvable questions.

## Step 2: Binary Markets Only

Only markets with **exactly 2 outcomes** are kept (e.g. "Yes" / "No", or two named options like "Lakers" / "Celtics"). Markets with 3 or more outcomes are discarded — Sapience's forecasting interface is built around binary questions.

## Step 3: Volume & Liquidity Filters

A market must pass **both** of these thresholds to be included:

| Threshold          | Minimum |
| ------------------ | ------- |
| **Trading volume** | $5,000  |
| **Liquidity**      | $1,000  |

Markets with an event are each treated as their own group. A market passes if it meets both thresholds.

These thresholds ensure only markets with real trading activity and sufficient depth make it through. Thinly traded or illiquid markets are excluded.

### Step 4: Always-Include Override

Some topics are important enough that their markets should **always** appear on Sapience, even if they haven't hit the volume/liquidity thresholds yet (e.g. a newly created market that hasn't had time to accumulate trades).

The volume & liquidity filter is applied as a **union** with the always-include filter: a market passes if it meets the thresholds **OR** matches an always-include pattern.

A market is always included if its question mentions any of these:

| Topic                    | What it matches                  | Example market                                              |
| ------------------------ | -------------------------------- | ----------------------------------------------------------- |
| **Federal Reserve**      | "fed", "federal reserve"         | _"Will the Fed cut rates in March?"_                        |
| **S&P 500**              | "S&P 500", "SPX"                 | _"Will the S&P 500 close above 5,000?"_                     |
| **Daily Bitcoin price**  | "price of Bitcoin... on [date]"  | _"Will the price of Bitcoin be above $100,000 on March 1?"_ |
| **Daily Ethereum price** | "price of Ethereum... on [date]" | _"Will the price of Ethereum be above $4,000 on March 1?"_  |

These patterns are checked case-insensitively. The idea is that markets about major economic indicators and benchmark asset prices are always worth surfacing, regardless of how much trading activity they've seen so far.

## Step 5: Crypto Exclusion

Markets categorized as **crypto** are excluded by default. Polymarket has a very large number of crypto-related markets, and including all of them would overwhelm the feed with price-target questions.

**Exception:** Crypto markets that match an always-include pattern (like the daily BTC/ETH price markets above) still get through. The crypto exclusion and always-include filters are applied as a union, so always-include markets bypass the crypto filter.

## Step 6: Skip Existing Markets

Markets that already exist on Sapience are skipped. This check happens before enrichment so that existing markets also skip the LLM call.

## Step 7: Enrichment (Short Names & Categories)

Each market that passes all filters is enriched with two pieces of metadata before being listed:

### Categories

Every market is assigned to one of these categories:

| Category          | Examples                         |
| ----------------- | -------------------------------- |
| Sports            | NBA, NFL, soccer, eSports        |
| Crypto            | Bitcoin, Ethereum, DeFi          |
| Weather           | Temperature, hurricanes, climate |
| Tech & Science    | AI, SpaceX, NASA                 |
| Economy & Finance | Fed rates, S&P 500, GDP          |
| Geopolitics       | Elections, wars, policy          |
| Culture           | Oscars, tweets, entertainment    |

Categories are inferred from keywords in the market question and metadata. When keywords aren't enough, an LLM classifies the market.

### Short Names

Markets get a concise display label so they're easy to scan. For example:

| Full question                                    | Short name     |
| ------------------------------------------------ | -------------- |
| _"Will the price of Bitcoin be above $100,000?"_ | BTC >$100k     |
| _"Lakers vs. Celtics: O/U 224.5"_                | LAL/BOS O224.5 |
| _"Will the Fed cut rates in January?"_           | Fed cut Jan    |
| _"LeBron James: Points Over 25.5"_               | James O25.5pts |

Short names are generated from pattern rules first, with an LLM as a fallback for markets that don't match any pattern.

For full details on the enrichment system, see [market-enrichment.md](./market-enrichment.md).

## Step 8: Grouping & Negative-Risk Baskets

Markets that come from the same Polymarket event are listed under one **condition group** on Sapience, keyed by event title.

Polymarket also publishes **negative-risk baskets**: a set of mutually-exclusive binary markets (e.g. "NBA champion: Celtics?", "NBA champion: Knicks?", …) where exactly one resolves YES and the rest resolve NO. The basket is one logical question and its children must stay tied to the same basket id (`negRiskMarketId`).

Only `condition_group.negRiskMarketId` is persisted in the DB; `ConditionGroup.negRisk` is a GraphQL-derived boolean (`true` iff `negRiskMarketId` is non-null). One column, no chance of the flag and the id drifting apart.

The basket invariant is enforced by the API, with the keeper as a well-behaved client:

- **First condition decides.** The first condition assigned to a group stamps its basket id onto the group (null or otherwise). Every subsequent admission has to match exactly — strict equality, including null. A basket condition trying to join a non-basket group is just as wrong as the reverse.
- The keeper stamps a fresh group's `negRiskMarketId` only when every market in that group is flagged `negRisk: true` **and** shares the same basket id. If any market disagrees, the group is sent with no basket id and the API derives `negRisk: false`.
- The admin REST routes (`/admin/conditions`, `/admin/conditionGroups`) reject any new condition admission whose payload `negRiskMarketId` doesn't equal the group's stored value. Continuing membership is grandfathered: a metadata-only edit on an already-linked condition doesn't have to restate the basket id.
- Same-event-title markets coming from **different** baskets are no longer auto-segmented into suffixed group names. They land naturally under the shared title; whichever basket reaches the API first wins the group, and the others surface as 400s the operator can triage. The keeper logs these distinctly in `submitToAPI`:

  ```
  … Batch N unable to add to existing negRisk group: Cannot add non-matching negRisk conditions to negRisk group NBA champion. Expected negRiskMarketId basket-a; mismatched: 0xabc…
  ```

A group's basket id is a **one-way ratchet** on the keeper: it can flip `null → 'basket-x'` when fresh Polymarket markets agree on a basket id, but the keeper will never auto-clear it. Demoting silently would dissolve the basket invariant, so when fresh markets disagree on basketing the keeper logs `[Metadata] refused to demote group <id> ("<title>") from negRisk: …` and emits no update. Recovery for that case is a deliberate admin REST edit (`PUT /admin/conditionGroups/:id` with `negRiskMarketId: null`) if Polymarket truly retired the basket.

---

Have ideas on how we should change the curation criteria? Come discuss it in our [Discord](https://discord.gg/sapience) or submit a pull request.
