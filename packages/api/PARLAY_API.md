# Parlay API Documentation

This documentation describes the new functionalities added to support parlays in the API.

## Implemented Features

### 1. Similar Markets

The `similarMarkets` field was added to the `Market` model to store an array of URLs of similar markets.

#### Create Market with Similar Markets

```typescript
// POST /create-market-group/:marketGroupAddress/markets
{
  "marketData": {
    "marketQuestion": "¿Ganará el equipo A?",
    "optionName": "Sí",
    "startTime": "1640995200",
    "endTime": "1641081600",
    "startingSqrtPriceX96": "79228162514264337593543950336",
    "baseAssetMinPriceTick": "0",
    "baseAssetMaxPriceTick": "100",
    "claimStatementYesOrNumeric": "El equipo A gana",
    "claimStatementNo": "El equipo A no gana",
    "rules": "Reglas del mercado",
    "similarMarkets": [
      "/market/123",
      "/market/456",
      "/market/789"
    ]
  },
  "chainId": "1"
}
```

### 2. Parlay Incompatibility (Market Groups)

A matrix incompatibility system was implemented where by default all market groups are compatible, except those explicitly marked as incompatible. **Incompatibilities are managed at the market group level, not individual markets.**

#### Mark Market Groups as Incompatible

```typescript
// POST /parlay/incompatibility
{
  "marketGroupAId": 1,
  "marketGroupBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

**Response:**
```json
{
  "id": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "marketGroupAId": 1,
  "marketGroupBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

#### Remove Incompatibility

```typescript
// DELETE /parlay/incompatibility
{
  "marketGroupAId": 1,
  "marketGroupBId": 2
}
```

**Response:**
```json
{
  "message": "Incompatibility removed successfully"
}
```

### 3. Compatibility Queries

#### Get Incompatible Market Groups

```typescript
// GET /parlay/incompatible-market-groups/:marketGroupId
// GET /parlay/incompatible-market-groups/1
```

**Response:**
```json
[
  {
    "id": 2,
    "address": "0x1234567890abcdef",
    "chainId": 1,
    "question": "¿Ganará el equipo B?",
    "baseTokenName": "TEAM_B",
    "quoteTokenName": "USDC"
  }
]
```

#### Check Compatibility between Two Market Groups

```typescript
// GET /parlay/check-compatibility?marketGroupAId=1&marketGroupBId=2
```

**Response:**
```json
{
  "isCompatible": false,
  "incompatibilityReason": "Same event, different outcomes"
}
```

#### Get All Incompatibilities

```typescript
// GET /parlay/all-incompatibilities
```

**Response:**
```json
[
  {
    "id": 1,
    "marketGroupAId": 1,
    "marketGroupBId": 2,
    "incompatibilityReason": "Same event, different outcomes",
    "marketGroupA": {
      "id": 1,
      "address": "0x1234567890abcdef",
      "chainId": 1,
      "question": "¿Ganará el equipo A?"
    },
    "marketGroupB": {
      "id": 2,
      "address": "0xfedcba0987654321",
      "chainId": 1,
      "question": "¿Ganará el equipo B?"
    }
  }
]
```

### 4. Parlay Probability Calculation

#### Calculate Success Probability of a Parlay

```typescript
// POST /parlay/get-parlay-chance
{
  "markets": [
    "0x1234567890abcdef/1",
    "0x1234567890abcdef/2",
    "0xfedcba0987654321/1"
  ],
  "marketPredictions": [true, false, true]
}
```

**Response:**
```json
{
  "parlayChance": 0.343,
  "markets": [
    "0x1234567890abcdef/1",
    "0x1234567890abcdef/2",
    "0xfedcba0987654321/1"
  ],
  "message": "Parlay chance calculated successfully"
}
```

**Notes:**
- `parlayChance` is a value between 0 and 1
- Each market format must be `marketGroupAddress/marketIdx`
- `marketPredictions` must be an array of booleans with the same length as `markets`
- The calculation multiplies the individual probabilities based on predictions (true = Yes, false = No)
- **Automatically validates that market groups are compatible** before calculating

## Database Structure

### Market Model (Updated)

```prisma
model Market {
  // ... existing fields ...
  similarMarkets String[] @default([])
  
  // Relation to MarketGroup
  market_group MarketGroup? @relation(fields: [marketGroupId], references: [id])
}
```

### MarketGroup Model (Updated)

```prisma
model MarketGroup {
  // ... existing fields ...
  
  // Relations
  market Market[]
  
  // Parlay incompatibility relations
  parlayIncompatibilitiesA ParlayIncompatibility[] @relation("ParlayIncompatibilityA")
  parlayIncompatibilitiesB ParlayIncompatibility[] @relation("ParlayIncompatibilityB")
}
```

### ParlayIncompatibility Model (Updated)

```prisma
model ParlayIncompatibility {
  id                    Int      @id @default(autoincrement())
  createdAt             DateTime @default(now())
  
  // References to the two incompatible market groups
  marketGroupAId        Int
  marketGroupBId        Int
  
  // Reason why they are incompatible (optional)
  incompatibilityReason String?  @db.Text
  
  // Relations
  marketGroupA          MarketGroup @relation("ParlayIncompatibilityA", fields: [marketGroupAId], references: [id])
  marketGroupB          MarketGroup @relation("ParlayIncompatibilityB", fields: [marketGroupBId], references: [id])
  
  // Indexes to optimize queries
  @@unique([marketGroupAId, marketGroupBId])
  @@index([marketGroupAId])
  @@index([marketGroupBId])
}
```

## Usage Examples

### Scenario 1: Create Similar Markets

```typescript
// Create main market
const mainMarket = await fetch('/create-market-group/0x123/markets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketData: {
      marketQuestion: "¿Ganará el equipo A?",
      // ... other fields ...
      similarMarkets: ["/market/456", "/market/789"]
    },
    chainId: "1"
  })
});
```

### Scenario 2: Configure Market Group Incompatibilities

```typescript
// Mark market groups as incompatible
await fetch('/parlay/incompatibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketGroupAId: 1,
    marketGroupBId: 2,
    incompatibilityReason: "Same event, different outcomes"
  })
});

// Check compatibility
const compatibility = await fetch('/parlay/check-compatibility?marketGroupAId=1&marketGroupBId=2');
const result = await compatibility.json();
console.log(result.isCompatible); // false
```

### Scenario 3: Calculate Parlay Probability

```typescript
// Calculate parlay probability (automatically validates market group compatibility)
const parlayChance = await fetch('/parlay/get-parlay-chance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markets: [
      '0x1234567890abcdef/1',
      '0x1234567890abcdef/2',
      '0xfedcba0987654321/1'
    ],
    marketPredictions: [true, false, true]
  })
});
const chanceResult = await parlayChance.json();
console.log(`Parlay chance: ${chanceResult.parlayChance}`); // 0.343
```

## Important Notes

1. **By default, all market groups are compatible** - Only explicit incompatibilities are stored
2. **Incompatibilities are bidirectional** - If market group A is incompatible with B, B is incompatible with A
3. **Incompatibilities are at market group level** - All markets within incompatible market groups are automatically incompatible
4. **The similarMarkets field is optional** - If not provided, an empty array is used
5. **URLs in similarMarkets must follow the format** `/market/{id}`
6. **Validations include**:
   - Verify that both market groups exist
   - Verify that a market group is not marked as incompatible with itself
   - Validate that all required fields are provided
   - Automatically check market group compatibility before calculating parlay chances

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/parlay/incompatibility` | Mark two market groups as incompatible |
| DELETE | `/parlay/incompatibility` | Remove incompatibility between market groups |
| GET | `/parlay/incompatible-market-groups/:marketGroupId` | Get incompatible market groups |
| GET | `/parlay/check-compatibility` | Check if two market groups are compatible |
| GET | `/parlay/all-incompatibilities` | Get all incompatibilities |
| POST | `/parlay/get-parlay-chance` | Calculate parlay success probability |

## Next Steps

- Implement GraphQL resolvers for more flexible queries
- Add endpoints for bulk operations
- Implement cache to improve performance
- Add additional validations according to specific needs 