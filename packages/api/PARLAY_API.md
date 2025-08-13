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

### 2. Parlay Incompatibility

A matrix incompatibility system was implemented where by default all markets are compatible, except those explicitly marked as incompatible.

#### Mark Markets as Incompatible

```typescript
// POST /parlay/incompatibility
{
  "marketAId": 1,
  "marketBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

**Response:**
```json
{
  "id": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "marketAId": 1,
  "marketBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

#### Remove Incompatibility

```typescript
// DELETE /parlay/incompatibility
{
  "marketAId": 1,
  "marketBId": 2
}
```

**Response:**
```json
{
  "message": "Incompatibility removed successfully"
}
```

### 3. Compatibility Queries

#### Get Incompatible Markets

```typescript
// GET /parlay/incompatible-markets/:marketId
// GET /parlay/incompatible-markets/1
```

**Response:**
```json
[
  {
    "id": 2,
    "marketId": 2,
    "question": "¿Ganará el equipo B?",
    "optionName": "Sí"
  }
]
```

#### Get Compatible Markets

```typescript
// GET /parlay/compatible-markets/:marketId
// GET /parlay/compatible-markets/1
```

**Response:**
```json
[
  {
    "id": 3,
    "marketId": 3,
    "question": "¿Ganará el equipo C?",
    "optionName": "Sí"
  },
  {
    "id": 4,
    "marketId": 4,
    "question": "¿Ganará el equipo D?",
    "optionName": "Sí"
  }
]
```

#### Check Compatibility between Two Markets

```typescript
// GET /parlay/check-compatibility?marketAId=1&marketBId=2
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
    "marketAId": 1,
    "marketBId": 2,
    "incompatibilityReason": "Same event, different outcomes",
    "marketA": {
      "id": 1,
      "marketId": 1,
      "question": "¿Ganará el equipo A?"
    },
    "marketB": {
      "id": 2,
      "marketId": 2,
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

## Database Structure

### Market Model (Updated)

```prisma
model Market {
  // ... campos existentes ...
  similarMarkets String[] @default([])
  
  // Relaciones para parlay incompatibility
  parlayIncompatibilityAsA ParlayIncompatibility[] @relation("ParlayIncompatibilityA")
  parlayIncompatibilityAsB ParlayIncompatibility[] @relation("ParlayIncompatibilityB")
}
```

### ParlayIncompatibility Model (New)

```prisma
model ParlayIncompatibility {
  id                    Int      @id @default(autoincrement())
  createdAt             DateTime @default(now())
  
  // References to the two incompatible markets
  marketAId             Int
  marketBId             Int
  
  // Reason why they are incompatible (optional)
  incompatibilityReason String?  @db.Text
  
  // Relations
  marketA               Market   @relation("ParlayIncompatibilityA", fields: [marketAId], references: [id])
  marketB               Market   @relation("ParlayIncompatibilityB", fields: [marketBId], references: [id])
  
  // Indexes to optimize queries
  @@unique([marketAId, marketBId])
  @@index([marketAId])
  @@index([marketBId])
}
```

## Usage Examples

### Scenario 1: Create Similar Markets

```typescript
// Crear market principal
const mainMarket = await fetch('/create-market-group/0x123/markets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketData: {
      marketQuestion: "¿Ganará el equipo A?",
      // ... otros campos ...
      similarMarkets: ["/market/456", "/market/789"]
    },
    chainId: "1"
  })
});
```

### Scenario 2: Configure Incompatibilities

```typescript
// Marcar markets como incompatibles
await fetch('/parlay/incompatibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketAId: 1,
    marketBId: 2,
    incompatibilityReason: "Same event, different outcomes"
  })
});

// Verificar compatibilidad
const compatibility = await fetch('/parlay/check-compatibility?marketAId=1&marketBId=2');
const result = await compatibility.json();
console.log(result.isCompatible); // false
```

### Scenario 3: Get Markets for Parlay

```typescript
// Obtener markets compatibles con market 1
const compatibleMarkets = await fetch('/parlay/compatible-markets/1');
const markets = await compatibleMarkets.json();

// Filter markets that are not in similarMarkets of market 1
const market1 = await fetch('/market/1');
const market1Data = await market1.json();
const similarMarketIds = market1Data.similarMarkets.map(url => {
  const match = url.match(/\/market\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}).filter(id => id !== null);

const parlayCandidates = markets.filter(market => 
  !similarMarketIds.includes(market.id)
);

// Calculate parlay probability
const parlayChance = await fetch('/parlay/get-parlay-chance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markets: [
      '0x1234567890abcdef/1',
      '0x1234567890abcdef/2'
    ]
  })
});
const chanceResult = await parlayChance.json();
console.log(`Parlay chance: ${chanceResult.parlayChance}`); // 0.7

## Important Notes

1. **By default, all markets are compatible** - Only explicit incompatibilities are stored
2. **Incompatibilities are bidirectional** - If A is incompatible with B, B is incompatible with A
3. **The similarMarkets field is optional** - If not provided, an empty array is used
4. **URLs in similarMarkets must follow the format** `/market/{id}`
5. **Validations include**:
   - Verify that both markets exist
   - Verify that a market is not marked as incompatible with itself
   - Validate that all required fields are provided

## Next Steps

- Implement GraphQL resolvers for more flexible queries
- Add endpoints for bulk operations
- Implement cache to improve performance
- Add additional validations according to specific needs 