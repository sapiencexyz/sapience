# Sapience Polymarket Conditions Setup

This guide shows how to populate your Sapience database with Polymarket prediction markets.

## Quick Start

### Generate JSON Only

```bash
cd packages/api
pnpm exec tsx scripts/generate-sapience-conditions.ts
```

This generates:
- **sapience-conditions.json** - Structured format with groups and conditions

### Generate and Submit to API

```bash
cd packages/api
SAPIENCE_API_URL=http://localhost:4000 ADMIN_PRIVATE_KEY=your_admin_token pnpm exec tsx scripts/generate-sapience-conditions.ts
```

This will:
1. Generate **sapience-conditions.json**
2. Submit condition groups and conditions to the API
3. Skip duplicates gracefully (API returns 409 for existing items)

**Note**: The script uses `conditionHash` (Polymarket's conditionId) as the `claimStatement` field when submitting to the API.

## Database Schema

### ConditionGroup
```typescript
{
  id: string;              // e.g., "2028-us-presidential-election"
  title: string;           // e.g., "2028 US Presidential Election"
  description: string;     // Short description
  categorySlug: string;    // Sapience category (majority vote from conditions)
  conditions: Condition[]; // Array of related conditions
}
```

### Condition
```typescript
{
  conditionHash: string;   // Polymarket's conditionId (bytes32) - USE THIS for resolution
  question: string;        // e.g., "Will Trump win?"
  endDate: string;         // ISO 8601 date
  description: string;     // Full market description
  similarMarkets: string[]; // Polymarket reference URLs (format: polymarket.com#slug)
  categorySlug: string;    // Sapience category: crypto, weather, tech-science, geopolitics, economy-finance, sports, or culture
  groupId?: string;        // References ConditionGroup (if grouped)
}
```

**Note:** All conditions are binary (Yes/No). The outcomes are always `["Yes", "No"]` so they're not included in the data.

**URL Format:** Polymarket URLs vary by market type (events, sports, etc.), so we provide a simple reference format `polymarket.com#slug` where the slug can be used to search/identify the market on Polymarket.

**Category Inference:** The `categorySlug` is automatically inferred from Polymarket's series slugs (e.g., "nba", "premier-league") and keyword matching on the question text. This maps to your Sapience categories from `fixtures.json`.

## Key Concept: conditionHash

**The `conditionHash` field contains Polymarket's `conditionId` (the bytes32 hash from their ConditionalTokens contract).**

This is the value you pass to `PredictionMarketLZConditionalTokensResolver`:

```solidity
// Use conditionHash directly
bytes32 conditionHash = 0x2ca58175aa8080357d9706c535bb0be218ce7bb156dc48753e0d8b8ee6b56635;

// Request resolution from Polymarket via LayerZero
resolver.requestResolution{value: fee}(conditionHash, refCode);

// Check if settled
bool isSettled = resolver.isConditionSettled(conditionHash);

// Get outcome
bool resolvedToYes = resolver.getConditionResolution(conditionHash);
```

## Category Mapping

Each condition and condition group is automatically assigned a `categorySlug` that maps to your Sapience categories from `fixtures.json`:

| Sapience Category | categorySlug | Detection Method |
|-------------------|--------------|------------------|
| Sports | `sports` | Sports market types, series slugs (nba, nfl, premier-league, fifa), team names, sports keywords |
| Crypto | `crypto` | Keywords: bitcoin, ethereum, crypto, blockchain, defi, nft |
| Weather | `weather` | Keywords: weather, temperature, hottest, hurricane, climate |
| Tech & Science | `tech-science` | Keywords: ai, tech, science, nasa, space, robot, quantum |
| Economy & Finance | `economy-finance` | Keywords: stock, s&p, fed, inflation, gdp, economy, finance |
| Geopolitics | `geopolitics` | Keywords: election, president, senate, war, politics (default fallback) |
| Culture | `culture` | Keywords: oscar, movie, music, celebrity, entertainment, fashion |

### How It Works

1. **Series slug matching**: Polymarket's `events[].series[].slug` (e.g., "saudi-professional-league") is checked first
2. **Keyword matching**: Question text and slug are scanned for category-specific keywords
3. **Majority vote for groups**: Each group's `categorySlug` is determined by the most common category among its conditions
4. **Default fallback**: If no keywords match, defaults to `geopolitics` (most common for prediction markets)

### Using Categories in Database

When importing, you can look up the corresponding `Category` record:

```typescript
// Find the category by slug
const category = await prisma.category.findFirst({
  where: { slug: condition.categorySlug }
});

// Create condition with category reference
await prisma.condition.create({
  data: {
    conditionHash: condition.conditionHash,
    question: condition.question,
    categoryId: category?.id,
    // ... other fields
  }
});
```

## Import into Database

### Using Prisma (or your ORM)
```prisma
// schema.prisma
model ConditionGroup {
  id              String      @id
  title           String
  description     String
  conditions      Condition[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model Condition {
  conditionHash   String   @id  // Polymarket's conditionId
  question        String
  endDate         DateTime
  description     String
  similarMarkets  String[]      // Array of Polymarket URLs
  groupId         String?
  group           ConditionGroup? @relation(fields: [groupId], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([groupId])
  @@index([endDate])
}
```

> **Note:** All conditions are binary (Yes/No), so no need to store outcomes. The Polymarket slug is embedded in the URL.
```

```typescript
import sapienceData from './sapience-conditions.json';

// Import groups
for (const group of sapienceData.groups) {
  await prisma.conditionGroup.create({
    data: {
      id: group.id,
      title: group.title,
      description: group.description,
    },
  });
}

// Import conditions
for (const group of sapienceData.groups) {
  for (const condition of group.conditions) {
    await prisma.condition.create({
      data: {
        conditionHash: condition.conditionHash,
        question: condition.question,
        endDate: new Date(condition.endDate),
        description: condition.description,
        similarMarkets: condition.similarMarkets,
        groupId: condition.groupId,
      },
    });
  }
}

// Import ungrouped conditions
for (const condition of sapienceData.ungroupedConditions) {
  await prisma.condition.create({
    data: {
      conditionHash: condition.conditionHash,
      question: condition.question,
      endDate: new Date(condition.endDate),
      description: condition.description,
      similarMarkets: condition.similarMarkets,
    },
  });
}
```

## Example Output

### Grouped Market Example
```json
{
  "id": "2028-democratic-presidential-nomination",
  "title": "2028 Democratic presidential nomination",
  "description": "This market will resolve to "Yes" if...",
  "categorySlug": "geopolitics",
  "conditions": [
    {
      "conditionHash": "0x3e218c99a1335641b3a5ee6c887521d19b0c28fddd6b99c254a07968e35c0b1b",
      "question": "Will Michelle Obama win the 2028 Democratic presidential nomination?",
      "endDate": "2028-11-07T00:00:00Z",
      "similarMarkets": [
        "https://polymarket.com#will-michelle-obama-win-the-2028-democratic-presidential-nomination-777"
      ],
      "categorySlug": "geopolitics",
      "groupId": "2028-democratic-presidential-nomination"
    },
    {
      "conditionHash": "0xdce84960dce38aa4a5800a5eba7c9ac34d2ce49ba9d44c42572c472d468af264",
      "question": "Will Raphael Warnock win the 2028 Democratic presidential nomination?",
      "endDate": "2028-11-07T00:00:00Z",
      "similarMarkets": [
        "https://polymarket.com#will-raphael-warnock-win-the-2028-democratic-presidential-nomination-914"
      ],
      "categorySlug": "geopolitics",
      "groupId": "2028-democratic-presidential-nomination"
    }
  ]
}
```

## Resolution Flow

1. **User creates a prediction** referencing a `conditionHash`
2. **Before settlement**, call the resolver:
   ```typescript
   const isSettled = await resolver.isConditionSettled(conditionHash);
   if (!isSettled) {
     // Optionally trigger resolution request
     await resolver.requestResolution(conditionHash, refCode, { value: fee });
   }
   ```
3. **Check outcome**:
   ```typescript
   const outcome = await resolver.getConditionResolution(conditionHash);
   // outcome is true for YES, false for NO
   ```
4. **Settle user predictions** based on the outcome

## Benefits of This Approach

✅ **No need to create conditions** - Just reference Polymarket's existing ones  
✅ **Automatic resolution** - Read results from Polymarket via LayerZero  
✅ **Always accurate** - Single source of truth (Polymarket's on-chain data)  
✅ **Rich metadata** - Descriptions, URLs, grouping from Polymarket  
✅ **Easy updates** - Re-run script to refresh with latest markets  

## Updating Markets

Run the script periodically to get new markets:

```bash
# Update with latest markets
pnpm exec tsx scripts/generate-sapience-conditions.ts

# Then run your upsert script to import new/updated markets
# Your script should handle UPSERT by conditionHash to avoid duplicates
```

## SimilarMarkets URL Format

The `similarMarkets` field contains Polymarket URLs with the slug appended after `#`:

```
https://polymarket.com/event/{slug}#{slug}
```

Example:
```
https://polymarket.com/event/will-michelle-obama-win-the-2028-democratic-presidential-nomination-777#will-michelle-obama-win-the-2028-democratic-presidential-nomination-777
```

This allows users to:
- Click through to see more details on Polymarket
- Compare prices between platforms
- Verify market legitimacy

## What You Get

From running the script once:
- **100 conditions** ready to use
- **67 condition groups** for better UX
- **All binary markets** (Yes/No only)
- **Active markets** (not yet resolved)
- **High volume markets** (sorted by trading volume)

## Configuration

### Resolver Address

The script includes a `RESOLVER_ADDRESS` constant that should be set to your deployed `PredictionMarketLZConditionalTokensResolver` contract address. 

**Current value**: `0x0000000000000000000000000000000000000000` (placeholder)

Update this in `scripts/generate-sapience-conditions.ts` before running in production:

```typescript
const RESOLVER_ADDRESS = '0xYourActualResolverAddress' as const;
```

### Environment Variables

- `SAPIENCE_API_URL`: Your Sapience API base URL (e.g., `http://localhost:4000` or `https://api.sapience.com`)
- `ADMIN_PRIVATE_KEY`: Admin authentication token for API access

## Potential Issues & Important Notes

### 1. **conditionHash = Condition ID** ✅

The script now sends `conditionHash` directly to the API, which uses it as the condition ID. This means:

```typescript
// Script sends:
conditionHash: "0x2ca58175..."  // Polymarket's conditionId

// API uses it directly:
id: "0x2ca58175..."  // Same as Polymarket!

// Database stores:
Condition.id = "0x2ca58175..."  // Perfect match ✅
```

**No mapping needed!** The condition ID in your database will be **identical** to Polymarket's `conditionId`, making resolution via LayerZero straightforward.

**Note on claimStatement:** The API still supports the `claimStatement` field for UMA resolvers (where it's used to compute the condition ID). When `conditionHash` is provided (for external conditions like Polymarket), the `claimStatement` field is optional and can be left empty since the ID is already determined.

### 2. **Resolver Field**

The `Condition` model has an optional `resolver` field that stores the resolver contract address. The script includes `resolver: RESOLVER_ADDRESS` in the API submission, which is currently set to a placeholder address (`0x0000000000000000000000000000000000000000`).

**Action Required**: Update the `RESOLVER_ADDRESS` constant in `scripts/generate-sapience-conditions.ts` with your deployed `PredictionMarketLZConditionalTokensResolver` contract address before running the script in production.

The `resolver` field is also tracked in the `Prediction` model when creating predictions.

### 3. **Duplicate Handling**

The script handles duplicates gracefully:
- API returns `409 Conflict` for existing groups/conditions
- Script logs these as "skipped" rather than errors
- Safe to re-run the script multiple times

### 4. **Category Mapping**

Categories must exist in your database before running the script. The script uses `categorySlug` to look up categories. Ensure your fixtures have been loaded:

```bash
cd packages/api
pnpm run prisma:setup
```

### 5. **Timestamp Conversion**

The script converts ISO 8601 dates to Unix timestamps (seconds). Ensure your API expects timestamps in seconds, not milliseconds.

### 6. **Chain ID**

All conditions are created with `chainId: 5064014` (Ethereal). The chain ID is set upstream in the data structure when transforming Polymarket markets. If you need a different chain, update the `CHAIN_ID_ETHEREAL` constant at the top of the script.

## Next Steps

1. ✅ Run the script to generate sapience-conditions.json
2. ✅ (Optional) Set environment variables and submit to API
3. Update `RESOLVER_ADDRESS` with your deployed resolver contract
4. Configure your resolver with Polymarket settings:
   - targetEid: `30109` (Polygon)
   - conditionalTokens: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
   - readChannelEid: `40109`
5. Start accepting predictions using the condition IDs
6. Use the resolver to fetch results when markets settle

## FAQ

**Q: Why use Polymarket's conditionId directly as our condition ID?**  
A: Because you're resolving via LayerZero's lzRead from Polymarket's ConditionalTokens contract. Using their exact conditionId as our ID eliminates the need for any mapping and makes resolution straightforward.

**Q: Can we add our own custom markets?**  
A: Yes! You can create your own conditions with your own resolver. Use the `claimStatement` field for UMA-style conditions (API will generate an ID), or provide a custom `conditionHash` for other resolver types.

**Q: What if Polymarket changes their markets?**  
A: Re-run the script to get updates. The API handles duplicates gracefully (returns 409 for existing conditions).

**Q: Do we need to pay to resolve conditions?**  
A: Yes, LayerZero lzRead requires paying gas fees. See `quoteResolution()` for fee estimates.

