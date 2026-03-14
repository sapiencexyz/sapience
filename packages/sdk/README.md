## Auction Validation Architecture

The SDK provides a unified, two-tier validation pipeline for auction
interactions. All consumers (relayer, trading terminal, market maker, future
gossip nodes) use the same SDK functions — no consumer is authoritative.

### Two Tiers

|          | Tier 1: Offline                                      | Tier 2: On-chain Reads                                             |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| **What** | Fields + picks + deadline + offline sig verification | `verifyMintPartySignature()` + `isNonceUsed()` + balance/allowance |
| **RPC**  | None required\*                                      | Configurable fail-open                                             |
| **Who**  | All consumers, always                                | Terminal, market makers (NOT relayer)                              |

\* Tier 1 includes optional ERC-1271 on-chain fallback (single `eth_call`) when `publicClient` is provided. Without it, unverifiable sigs → `'unverified'`. With Tier 2, `verifyMintPartySignature()` gives definitive true/false for all signature types (EOA, smart account, session key).

### Validation Functions

| Function             | Tier | What it checks                                           | Async? |
| -------------------- | ---- | -------------------------------------------------------- | ------ |
| `validateAuctionRFQ` | 1    | Fields + picks + deadline + intent signature             | Yes    |
| `validateBid`        | 1    | Fields + deadline + bid sig (+ ERC-1271 fallback)        | Yes    |
| `validateBidOnChain` | 2    | `verifyMintPartySignature` + nonce + balance + allowance | Yes    |
| `validateBidFull`    | 1+2  | `validateBid` + `validateBidOnChain`                     | Yes    |
| `preprocessBids`     | 1+2  | Batch: dedup + per-bid validation                        | Yes    |
| `validateVaultQuote` | 1    | Fields + timestamp + signature                           | Yes    |

### Three-State Result Model

`validateBid` can return three states: `valid`, `invalid`, or `unverified`.

- **`valid`** — signature verified, all checks passed
- **`invalid`** — provably bad (bad EOA sig, missing fields, expired deadline)
- **`unverified`** — signature could not be verified by any offline path and no `publicClient` was available for ERC-1271 fallback

Consumers should treat `unverified` like `invalid` for selection purposes. With Tier 2, `verifyMintPartySignature()` resolves all `unverified` to definitive `valid`/`invalid`.

### Data Flow

```
Predictor (app)
     │
     ▼
┌─────────────────┐  auction.start   ┌──────────────┐
│ initiateAuction │ ───────────────▶ │   Relayer    │
│ (SDK)           │                  │  (ws.ts)     │
└─────────────────┘                  └──────┬───────┘
                                            │ auction.started
                             ┌──────────────┼──────────────┐
                             ▼              ▼              ▼
                       ┌──────────┐  ┌──────────┐  ┌──────────┐
                       │ Terminal │  │  Maker   │  │  Maker   │
                       │ (app)   │  │ (starter)│  │ (custom) │
                       └────┬─────┘  └────┬─────┘  └────┬─────┘
                            │              │              │
              Each consumer validates independently using SDK
                            │              │              │
                            ▼              ▼              ▼
                        Tier 1+2       Tier 1+2       Tier 1+2

                            Relayer: Tier 1 only (no RPC)
```
