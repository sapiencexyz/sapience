# COMBO.BINGO backend service

A **stateless** backend that deals bingo cards, runs the RFQ auctions, and
mints the escrow positions **as the player** via a scoped session key. The
smart contracts are the database: the BingoCardReceipt NFT records every
submission and carries the payout rail; escrow events record every funded
line. The server stores nothing — it can restart, scale out, or run as a
serverless function with no volume and no journal.

## Trust model

The backend is trusted for exactly three things:

1. **The card draw.** Mitigated with verifiable fairness (below).
2. **Bonus + referral payouts** — discretionary, paid from the operator
   treasury wallet through the receipt contract (one-shot on-chain flags).
3. **Running the auctions honestly** — the relayer was always ours.

The backend is NOT trusted with custody. Funds stay in the player's smart
account; the client sends a **session key** with each request whose call
policy only permits:

- `wUSDe.deposit()` (wrap native USDe)
- `wUSDe.approve(escrow, …)` (escrow only — enforced by ParamCondition)
- `PredictionMarketEscrow.mint(…)`
- `PredictionMarketEscrow.redeem(…)`

So a fully compromised backend can, at worst, turn the player's balance into
predictions owned by the player. It can never move funds to a third party.
The session key is never stored — it lives only for the request it rides in
on.

## Verifiable fairness

The operator holds one master `SERVER_SECRET`. Per pool:

```
poolSecret = keccak256(master ‖ poolId)        // derived, never stored
commitment = keccak256(poolSecret)             // published while pool is open
seed       = keccak256(poolSecret ‖ poolId ‖ playerAddress ‖ uint32(cardIndex))
layout     = fisherYatesShuffle(poolConditions, seed)[0..16]
```

- Cards are per (pool, player, cardIndex) — a wallet can hold many cards,
  each with its own committed layout. Indexes are strictly sequential and
  enforced on-chain (the receipt contract reverts on a skipped or replayed
  index), so layouts can't be cherry-picked out of order.
- The backend cannot target a player with a bad card without breaking the
  commitment: after the pool cutoff the derived secret is revealed
  (`GET /api/fairness`), and anyone can recompute every card dealt. The seed
  is also stamped on the receipt NFT at submit time.
- Revealing one pool's secret exposes nothing about other pools or the
  master.

## Card lifecycle

```
 player/client               backend (stateless)              chain
   │  GET /api/card             │                                │
   │───────────────────────────▶│ deal from (poolSecret, player) │
   │◀─ layout (16 cells) ───────│ + read receipt/escrow state ──▶│
   │  POST /api/card/submit     │                                │
   │  {yesMask, price, ref,     │                                │
   │   session}                 │                                │
   │───────────────────────────▶│ mint receipt NFT (sponsored) ─▶│ Receipt.mint
   │◀─ {receiptTokenId} ────────│   = THE submission record      │  (locks sides,
   │                            │                                │   price, ref, seed)
   │  POST /api/card/line ×10   │                                │
   │  {lineIndex, session}      │                                │
   │───────────────────────────▶│ RFQ via relayer WS             │
   │                            │ validate bid on-chain          │
   │                            │ sign + mint via session key ──▶│ escrow.mint
   │◀─ {funded, txHash} ────────│ (synchronous, ~30-60s)         │  (predictor =
   │                            │                                │   player SA)
   │        … conditions resolve …                               │
   │  (positions + redemptions are the player's — redeem via     │
   │   their own wallet/session, same as any Sapience position)  │
```

- **Sides** (`yesMask`, bit i = YES on cell i) are locked by the receipt NFT
  mint at submit time; retries with different sides/price are refused
  against the chain record.
- **Cutoff**: submit and line requests are refused once `now >= cutoff`.
- **Idempotency**: a line is funded iff an escrow `PredictionCreated` event
  matches its pickConfigId, the card's per-card refCode tag
  (`'bngo' ‖ keccak('bingo' ‖ poolHash ‖ player ‖ index)[0:28]`), and the
  card's exact per-line stake. The event record is monotonic (survives
  redeems) and the tag attributes a mint to one card even when two of a
  player's cards draw an identical line.
- **The client drives the lines.** If the tab closes mid-card, the UI offers
  "Fund remaining lines" on return; nothing is lost or duplicated.

## Entitlements (bonus + referral)

Same math as the old contract, computed from chain state on demand:

- A card is **complete** when all 10 lines appear in escrow events.
- A line **wins** when all 4 cells resolved decisively on the declared side.
- `bonus = cardPrice × multiplierBps[winCount] / 10_000` (pool config).
- `referral = cardPrice × referralBps / 10_000`, to the referrer stamped on
  the receipt NFT.
- `GET /api/admin/entitlements` enumerates every receipt NFT and joins it
  against escrow + resolver state: lines funded, wins, decided/provisional,
  owed amounts, and the on-chain `bonusPaid`/`referralPaid` flags. The
  treasury pays through `payBonus`/`payReferral` on the receipt contract —
  one-shot, auditable, straight from the admin UI.

## State: all on-chain or config

| state              | source of truth                                 |
| ------------------ | ----------------------------------------------- |
| pools, multipliers | `pool.json` (one pool or array; last = active)  |
| card layout        | derived from `SERVER_SECRET` + poolId + player  |
| submission (sides, | receipt NFT `cardMeta` +                        |
| price, ref, seed)  | `CardReceiptMinted` events                      |
| line funded        | escrow `PredictionCreated` events (monotonic)   |
| wins / resolution  | chain (resolver `getResolution`)                |
| payouts paid       | receipt NFT one-shot flags                      |
| session keys       | client localStorage; sent per request, not kept |
| admin auth         | HMAC-signed nonces/tokens (no server sessions)  |

## Hosting

The handler is framework-free (`src/handler.ts`) and runs two ways:

- **Node service** (`src/server.ts`): also serves the built Vite frontend
  with an SPA fallback — one Railway-style service, same origin.
- **Vercel** (`api/index.ts` + `vercel.json`): the platform serves the
  static build; every `/api/*` request hits one function running the same
  handler. Project root = `packages/bingo-server`; line requests run a full
  auction + mint synchronously, so `maxDuration` is set to 300s (requires a
  plan with fluid compute / extended durations).

Dev: `pnpm --filter @sapience/bingo dev` proxies `/api` to the local server.

## API surface

| method | path                    | body / query                                       | returns                                            |
| ------ | ----------------------- | -------------------------------------------------- | -------------------------------------------------- |
| GET    | /api/health             |                                                    | `{ ok }`                                           |
| GET    | /api/pool               | `?poolId=` (optional)                              | pool config + fairnessCommitment + receiptContract |
| GET    | /api/fairness           |                                                    | per-pool commitments; + secrets once cutoffs pass  |
| GET    | /api/card               | `?player=0x…&poolId=`                              | layout + chain submission + per-line funded flags  |
| POST   | /api/card/submit        | `{ player, yesMask, cardPriceWei, ref?, session }` | `{ receiptTokenId }` — mints the receipt NFT       |
| POST   | /api/card/line          | `{ player, lineIndex, session, poolId? }`          | `{ funded, txHash }` — auction + mint, synchronous |
| GET    | /api/admin/nonce        |                                                    | SIWE nonce (HMAC-signed, stateless)                |
| POST   | /api/admin/login        | `{ message, signature }`                           | `{ token }` (HMAC-signed bearer, 12h)              |
| GET    | /api/admin/entitlements | `Authorization: Bearer <token or ADMIN_TOKEN>`     | entitlement rows + totals, all from chain          |
