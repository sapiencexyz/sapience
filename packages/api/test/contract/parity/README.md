# v1 ↔ v2 parity suite

Each `*.pair.test.ts` runs a real v1 operation and its v2 equivalent against
the **same seeded fixture DB** (`test/fixtures/contract.sql`, loaded by the
contract suite's `globalSetup`), projects both results onto one canonical
shape, and asserts deep equality. Green pair = the v2 surface returns the
same data the v1 consumer sees today. A domain's consumer flip (PR #1823)
must not land before its pair is green here.

Run: `pnpm --filter @sapience/api run test:parity`
(or `run test:contract -- parity/<name>` for one pair).

## Writing a pair (60–90 lines, one self-contained file)

1. Take the v1 doc from `test/contract/fixtures/v1-operations.ts` (frozen
   copies — never import op text from `@sapience/sdk/queries`; the SDK's
   constants flip to v2 during the migration). App-inline ops are pasted
   with a `// source: packages/app/src/...` comment.
2. Write the v2 doc by hand against `packages/api/schema.v2.graphql`, with
   an **explicit `orderBy`** (v2 defaults differ from v1) and **explicit
   visibility filters on BOTH sides** (v2 `conditions` silently defaults to
   `public: true`; v1 `where: {}` does not).
3. Define a `Canonical` interface from the fields the migrating consumer
   actually selects. Write `projectV1` / `projectV2` as plain functions,
   sorted by domain key (CTF hash, address, slug, tradeHash, uid). **A
   projection may only drop or coerce a field to encode a documented
   difference, and every such line carries a comment naming the decision**
   (G-number from SCHEMA_GAPS.md, or the PR that added the compat field).
4. `both()` + `expect(v2).toEqual(v1)` (v1 is `expected`, so a failing diff
   reads "v2 deviates from v1") + `expectMonotonic` on each side's raw order.
5. If the diff shows a real semantic difference: prefer fixing the server
   (north star: API does computation, not consumers); otherwise record the
   decision in SCHEMA_GAPS.md and encode it in the projection with the
   reference.

Allowed drop classes: opaque ids (assert identity via the domain key),
cursors / pageInfo internals (`hasNextPage` IS compared where a consumer
uses it: v1 `take N+1` over-fetch vs v2 `pageInfo.hasNextPage`),
`*Formatted` render-ready fields (no v1 counterpart by construction),
decided absences (G9 assertion fields; vault-scoped `protocolStats` fields).
`stabilize()` is **not** used here — it would mask real value regressions;
the one legitimate exception class is server-`now()`-derived fields, dropped
per-pair with a comment.

Ordering: rows are compared as a **set** (sorted by domain key). v1 (no
tie-break) and v2 (id tie-break) do not promise the same total order, so
each side's ordering contract is asserted independently instead. Page-
boundary ties on a frozen fixture are deterministic; if a fixture refresh
ever trips one, widen `take`/`first` or pin a filter.

**No referral pairs, ever** — referral reads stay on v1 permanently
(SCHEMA_GAPS G8). **No keeper pairs** until G2/G3 are built.

What this suite does NOT catch: HTTP/middleware behavior (APQ, CORS, cache
headers, edge-cache), complexity/depth limits (no plugins attached — when a
consumer doc lands, add a unit test calling `getComplexity()` on it),
prod-scale performance, and anything the frozen fixture has no rows for.
