# COMBO.BINGO backend service

A trusted backend that deals bingo cards, runs the RFQ auctions, and mints the
escrow positions **as the user** via a scoped session key. Replaces the
BingoCard smart contract entirely — there is no bingo contract in this
architecture.

## Trust model

The backend is trusted for exactly three things, all of which were already
trusted off-chain in the prior design:

1. **The card draw.** Mitigated with verifiable fairness (below).
2. **Bonus + referral payouts** — discretionary, paid from the operator
   treasury wallet.
3. **Running the auctions honestly** — the relayer was always ours.

The backend is NOT trusted with custody. Funds stay in the player's smart
account; the backend holds a **session key** whose call policy only permits:

- `wUSDe.deposit()` (wrap native USDe)
- `wUSDe.approve(escrow, …)` (escrow only — enforced by ParamCondition)
- `PredictionMarketEscrow.mint(…)`
- `PredictionMarketEscrow.redeem(…)`

So a fully compromised backend can, at worst, turn the player's balance into
predictions owned by the player. It can never move funds to a third party.

## Verifiable fairness

Per pool, the operator generates a random 32-byte `SERVER_SECRET` and
publishes its hash (`fairnessCommitment = keccak256(secret)`) when the pool
opens. Every card is dealt deterministically:

```
seed   = keccak256(secret ‖ poolId ‖ playerAddress)
layout = fisherYatesShuffle(poolConditions, seed)[0..16]
```

- One player address → one card per pool, by construction. No re-rolling by
  abandonment; a new card requires a new funded smart account.
- The backend cannot target a player with a bad card without breaking the
  commitment: after the pool cutoff the secret is revealed
  (`GET /fairness` includes it once `now >= cutoff`), and anyone can recompute
  every card dealt.
- The player cannot grind layouts: the seed depends on the secret they don't
  know.

## Card lifecycle

```
 player                     backend                          chain
   │  POST /session            │                                │
   │  (serialized session key) │                                │
   │──────────────────────────▶│ verify + store                 │
   │  GET /card                │                                │
   │──────────────────────────▶│ deal from (secret, player)     │
   │◀─ layout (16 cells) ──────│                                │
   │  POST /card/submit        │                                │
   │  {yesMask, priceWei, ref} │                                │
   │──────────────────────────▶│ for each of 10 lines:          │
   │                           │   RFQ via relayer WS           │
   │                           │   validate bid on-chain        │
   │                           │   sign + mint via session key ─▶ escrow.mint
   │  GET /card  (poll)        │                                │   (predictor =
   │──────────────────────────▶│ live per-line progress         │    player SA)
   │                           │                                │
   │        … conditions resolve …                              │
   │                           │                                │
   │  (positions + redemptions are the player's — redeem via    │
   │   their own wallet/session, same as any Sapience position) │
```

- **Sides** (`yesMask`, bit i = YES on cell i) are declared once per card at
  submit time and persisted in the backend's journal. They are also evidenced
  on-chain by the picks inside each minted line.
- **Cutoff**: `POST /card/submit` (and any retry) is refused once
  `now >= pool.cutoff`. Since the backend is the only entity holding the
  session key, this is an effective hard stop, unlike the contract-free
  client-side variant.
- **Retries**: submission is idempotent per line — a line that already has a
  funded escrow position (predictor token balance > 0) is skipped.

## Entitlements (bonus + referral)

Same math as before, computed by the backend instead of a contract:

- A card is **complete** when all 10 lines have funded escrow positions.
- A line **wins** when all 4 cells resolved decisively on the declared side
  (resolver returns `ok` and exactly the picked weight nonzero).
- `bonus = cardPrice × multiplierBps[winCount] / 10_000` — table lives in the
  pool config, published via `GET /pool`.
- `referral = cardPrice × referralBps / 10_000`, attributed to the `ref`
  (a payout address) recorded at submit time.
- `GET /admin/entitlements` lists every card with player, lines funded, wins,
  decided-ness, bonus owed, referrer and referral owed. Payment itself is a
  manual treasury transfer for now; mark-as-paid lives in the journal.

## State & persistence

v1 is deliberately simple: an in-memory store backed by an append-only JSONL
journal (`DATA_DIR/journal.jsonl`), replayed on boot. Everything else is
derivable:

| state               | source of truth                                 |
| ------------------- | ----------------------------------------------- |
| pool, multipliers   | `pool.json` (config file)                       |
| card layout         | recomputable from `SERVER_SECRET` + player addr |
| session keys        | journal (`session` records)                     |
| declared sides, ref | journal (`submit` records)                      |
| line funded         | chain (escrow predictor-token balance)          |
| wins / resolution   | chain (resolver `getResolution`)                |
| payouts marked paid | journal (`payout` records)                      |

Postgres (via the API package's Prisma) is the obvious v2 home for the
journal once this leaves staging. The store module is the only thing that
would change.

## Hosting: one service

The server also serves the built Vite frontend (`STATIC_DIR`, default
`../bingo/dist`) with an SPA fallback, so frontend + backend deploy as a
single long-running Node service (Railway). Same origin — the frontend calls
relative `/api/...` paths. In dev, run both: `pnpm --filter @sapience/bingo
dev` proxies `/api` to the local server (`vite.config.ts`).

Deploy steps: `pnpm --filter @sapience/bingo build`, then start
`@sapience/bingo-server` with `SERVER_SECRET`, `ADMIN_TOKEN`, and a
`pool.json` mounted/checked in.

## API surface

| method | path                    | body / query                               | returns                                                                   |
| ------ | ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| GET    | /api/health             |                                            | `{ ok }`                                                                  |
| GET    | /api/pool               |                                            | pool id, cutoff, conditions, multipliers, referralBps, fairnessCommitment |
| GET    | /api/fairness           |                                            | commitment; + secret once cutoff passed                                   |
| POST   | /api/session            | serialized session (ZeroDev approval)      | `{ player }`                                                              |
| GET    | /api/card               | `?player=0x…`                              | layout + declared sides + per-line state                                  |
| POST   | /api/card/submit        | `{ player, yesMask, cardPriceWei, ref? }`  | submission accepted; poll /api/card                                       |
| GET    | /api/admin/entitlements | `Authorization: Bearer ADMIN_TOKEN`        | entitlement rows + totals                                                 |
| POST   | /api/admin/payouts      | `{ player, kind, amountWei, to, txHash? }` | marks a payout in the journal                                             |

## What this deletes

- `packages/protocol/src/bingo/` + deploy script + all BingoCard tests.
- Client-side auction orchestration (`packages/bingo/src/lib/submitCard.ts`)
  and its WebSocket bid-pairing.
- The contract address setting, approve flows, on-chain admin pool txs.

The bingo frontend keeps: wallet connect, session creation (with the slimmer
call policy above), the card UI, the bridge. It swaps contract reads for
`GET /pool` / `GET /card` and the submit flow for `POST /card/submit`.
