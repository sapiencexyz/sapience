# Pyth Binary Options

Price-based markets resolved by Pyth Lazer oracle data. Each market asks "Will price X be Over/Under strike Y at time T?"

## Market Structure

```typescript
import type { PythBinaryOptionMarket } from '@sapience/sdk/auction/encoding';

// PythBinaryOptionMarket = {
//   priceId: Hex;        // bytes32 — Pyth Lazer uint32 feedId, left-padded
//   endTime: bigint;     // uint64 — unix seconds
//   strikePrice: bigint; // int64 — scaled by strikeExpo
//   strikeExpo: number;  // int32 — e.g., -6 for USD
//   overWinsOnTie: boolean;
// }
```

## ConditionId Computation

The condition ID for a Pyth market is deterministic:

```javascript
import { getPythMarketId } from '@sapience/sdk/auction/encoding';

const conditionId = getPythMarketId({
  priceId: '0x...', // bytes32
  endTime: 1710000000n,
  strikePrice: 50000000000n, // $50,000 with expo -6
  strikeExpo: -6,
  overWinsOnTie: true,
});
// Returns keccak256(abi.encode(priceId, endTime, strikePrice, strikeExpo, overWinsOnTie))
```

## Outcome Mapping

For Pyth markets, Over maps to YES and Under maps to NO:

- `predictedOutcome: 0` (YES) = **Over** — betting the price will be at or above the strike
- `predictedOutcome: 1` (NO) = **Under** — betting the price will be below the strike

In the Pyth encoding helpers, `prediction: true` = Over = YES, `prediction: false` = Under = NO.

## Outcome Encoding

When building picks for Pyth markets, encode outcomes with:

```javascript
import { encodePythBinaryOptionOutcomes } from '@sapience/sdk/auction/encoding';

const encoded = encodePythBinaryOptionOutcomes([
  {
    priceId: '0x...',
    endTime: 1710000000n,
    strikePrice: 50000000000n,
    strikeExpo: -6,
    overWinsOnTie: true,
    prediction: true, // true = Over, false = Under
  },
]);
```

## Resolution

- **Outcome logic**: Over wins if `benchmarkPrice >= strikePrice` (when `overWinsOnTie=true`) or `benchmarkPrice > strikePrice` (when `overWinsOnTie=false`)
- **Settlement is permissionless**: Anyone can settle by calling `PythConditionResolver.settleCondition(market, updateData)` with Pyth Lazer verified price update data at the exact `endTime`
- **Resolver address**: Import from SDK — `pythConditionResolver[CHAIN_ID_ETHEREAL].address` (see `@sapience/sdk/contracts/addresses`)
- **ABI**: `pythConditionResolverAbi` from `@sapience/sdk/abis`

## Getting Pyth Lazer updateData

Fetch the price update from the Pyth Lazer API:

```bash
curl -X POST https://pyth-lazer.dourolabs.app/v1/price \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": <endTime_microseconds>,
    "priceFeedIds": [<feedId>],
    "properties": ["price", "exponent"],
    "formats": ["evm"],
    "channel": "fixed_rate@200ms",
    "jsonBinaryEncoding": "hex"
  }'
```

- `timestamp` is the market's `endTime` in **microseconds** (multiply unix seconds by `1_000_000`)
- `priceFeedIds` is the Pyth Lazer uint32 feed ID (not the bytes32 priceId)
- The response contains `evm.data` — a hex-encoded blob to pass as `updateData` to `settleCondition()`
- No authentication required for public feeds
